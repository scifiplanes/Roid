import { getScanOverlayLegendGrouped } from '../game/scanVisualization'
import { loadOverlayLegendCollapsed, saveOverlayLegendCollapsed } from './uiLayoutPrefs'

export interface OverlaysMenuOptions {
  initialSurfaceScanVisible: boolean
  initialDepthOverlayVisible: boolean
  /** Called when the eye popover opens and after mesh changes; enables Depth row when true. */
  getDepthOverlayUnlocked: () => boolean
  /** Tooltip when Depth is disabled (research not done yet vs no scanner placed). */
  getDepthOverlayLockedHint?: () => string
  onSurfaceScanChange: (visible: boolean) => void
  onDepthOverlayChange: (visible: boolean) => void
}

export interface OverlaysMenuApi {
  element: HTMLElement
  syncDepthOverlayUnlock: () => void
  /** Sync checkbox + app state; no-op if requesting on while depth overlay is still locked. */
  setDepthOverlayChecked: (checked: boolean) => void
}

/**
 * Eye button + popover with overlay toggles (Surface scan, Depth). Returns root for settings top bar.
 */
export function createOverlaysMenu(_container: HTMLElement, options: OverlaysMenuOptions): OverlaysMenuApi {
  const root = document.createElement('div')
  root.className = 'overlays-menu'

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'overlays-toggle'
  btn.title = 'Overlays'
  btn.setAttribute('aria-label', 'Overlays')
  btn.setAttribute('aria-haspopup', 'true')
  btn.setAttribute('aria-expanded', 'false')

  btn.innerHTML = `
<svg class="overlays-eye-svg" width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="8" cy="8" rx="6.5" ry="2" stroke="var(--nc-border)" stroke-width="1" />
  <circle cx="8" cy="8" r="1" stroke="var(--nc-accent)" stroke-width="2" />
</svg>`

  const pop = document.createElement('div')
  pop.className = 'overlays-popover'
  pop.hidden = true
  pop.setAttribute('role', 'menu')
  pop.setAttribute('aria-label', 'Map overlays')

  const rowScan = document.createElement('label')
  rowScan.className = 'overlays-menu-row'
  const cbScan = document.createElement('input')
  cbScan.type = 'checkbox'
  cbScan.setAttribute('role', 'menuitemcheckbox')
  cbScan.checked = options.initialSurfaceScanVisible
  const spanScan = document.createElement('span')
  spanScan.textContent = 'Surface scan'
  rowScan.append(cbScan, spanScan)

  const rowDepth = document.createElement('label')
  rowDepth.className = 'overlays-menu-row'
  const cbDepth = document.createElement('input')
  cbDepth.type = 'checkbox'
  cbDepth.setAttribute('role', 'menuitemcheckbox')
  cbDepth.checked = options.initialDepthOverlayVisible
  const spanDepth = document.createElement('span')
  spanDepth.textContent = 'Depth'
  rowDepth.append(cbDepth, spanDepth)

  const legend = document.createElement('div')
  legend.className = 'overlays-legend'
  legend.hidden = true
  legend.setAttribute('role', 'region')
  legend.setAttribute('aria-label', 'Overlay legend')

  const legendHeader = document.createElement('div')
  legendHeader.className = 'overlays-legend-header'

  const legendTitle = document.createElement('div')
  legendTitle.className = 'overlays-legend-title'
  legendTitle.textContent = 'Legend'

  const legendCollapseBtn = document.createElement('button')
  legendCollapseBtn.type = 'button'
  legendCollapseBtn.className = 'overlays-legend-collapse-btn'
  legendCollapseBtn.setAttribute('aria-controls', 'overlays-legend-body')

  const legendBody = document.createElement('div')
  legendBody.id = 'overlays-legend-body'
  legendBody.className = 'overlays-legend-body'

  legendHeader.append(legendTitle, legendCollapseBtn)

  const legendBlurb = document.createElement('p')
  legendBlurb.className = 'overlays-legend-blurb'

  const legendFamilies = document.createElement('div')
  legendFamilies.className = 'overlays-legend-families'

  for (const fam of getScanOverlayLegendGrouped()) {
    const row = document.createElement('div')
    row.className = 'overlays-legend-family'
    const name = document.createElement('span')
    name.className = 'overlays-legend-family-name'
    name.textContent = fam.familyLabel
    const sw = document.createElement('div')
    sw.className = 'overlays-legend-swatches'
    for (const s of fam.swatches) {
      const chip = document.createElement('span')
      chip.className = 'overlays-legend-swatch'
      chip.style.backgroundColor = s.cssColor
      chip.textContent = s.hudAbbrev
      chip.title = s.fullName
      sw.appendChild(chip)
    }
    row.append(name, sw)
    legendFamilies.appendChild(row)
  }

  legendBody.append(legendBlurb, legendFamilies)
  legend.append(legendHeader, legendBody)
  pop.append(rowScan, rowDepth, legend)

  let legendCollapsed = loadOverlayLegendCollapsed()

  function syncLegendCollapsedUi(): void {
    legend.classList.toggle('overlays-legend--collapsed', legendCollapsed)
    legendCollapseBtn.setAttribute('aria-expanded', String(!legendCollapsed))
    legendCollapseBtn.textContent = legendCollapsed ? 'Show' : 'Hide'
    legendCollapseBtn.title = legendCollapsed ? 'Show legend swatches' : 'Hide legend swatches'
  }

  syncLegendCollapsedUi()

  legendCollapseBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    legendCollapsed = !legendCollapsed
    saveOverlayLegendCollapsed(legendCollapsed)
    syncLegendCollapsedUi()
  })
  root.append(btn, pop)

  function syncDepthOverlayUnlock(): void {
    const ok = options.getDepthOverlayUnlocked()
    cbDepth.disabled = !ok
    const hint = ok
      ? 'Transparent rock; reveal rate and per-voxel opacity depend on material depth-scan susceptibility'
      : options.getDepthOverlayLockedHint?.() ??
        'Unlock by placing a depth scanner on rock or processed matter (Depth scan tool)'
    rowDepth.title = hint
    cbDepth.title = hint
    spanDepth.classList.toggle('overlays-menu-row-locked', !ok)
    updateLegend()
  }

  syncDepthOverlayUnlock()

  function setDepthOverlayChecked(checked: boolean): void {
    if (checked && !options.getDepthOverlayUnlocked()) return
    if (cbDepth.checked === checked) {
      options.onDepthOverlayChange(checked)
      return
    }
    cbDepth.checked = checked
    options.onDepthOverlayChange(checked)
    updateLegend()
  }

  function updateLegend(): void {
    const open = !pop.hidden
    const depthOk = options.getDepthOverlayUnlocked()
    const anyOverlay =
      (cbScan.checked && open) || (cbDepth.checked && depthOk && open)
    legend.hidden = !anyOverlay
    pop.classList.toggle('overlays-popover--with-legend', anyOverlay)
    if (!anyOverlay) return
    const parts: string[] = []
    if (cbScan.checked) {
      parts.push(
        'Surface scan: voxel tint blends refined materials (one refinement hop from bulk). Scanner satellite applies the tint.',
      )
    }
    if (cbDepth.checked && depthOk) {
      parts.push(
        'Depth: same refined tint; reveal rate and opacity follow bulk depth-scan susceptibility (dense, low-susceptibility materials stay more opaque).',
      )
    }
    legendBlurb.textContent = parts.join(' ')
  }

  function setOpen(open: boolean): void {
    pop.hidden = !open
    btn.setAttribute('aria-expanded', String(open))
    if (open) syncDepthOverlayUnlock()
    updateLegend()
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    setOpen(pop.hidden)
  })

  cbScan.addEventListener('change', () => {
    options.onSurfaceScanChange(cbScan.checked)
    updateLegend()
  })

  cbDepth.addEventListener('change', () => {
    if (cbDepth.disabled) {
      cbDepth.checked = false
      updateLegend()
      return
    }
    options.onDepthOverlayChange(cbDepth.checked)
    updateLegend()
  })

  document.addEventListener('click', (e) => {
    if (!root.contains(e.target as Node)) setOpen(false)
  })

  return { element: root, syncDepthOverlayUnlock, setDepthOverlayChecked }
}
