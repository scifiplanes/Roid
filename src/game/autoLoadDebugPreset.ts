import { applyDebugPresetFromParsed, type DebugPresetFileV1 } from './debugPreset'

/**
 * Attempt to load and apply the bundled debug preset from public assets.
 * This runs early in initialization to apply debug settings before game state is created.
 * In dev mode, this is a no-op to avoid interfering with development workflow.
 * Gracefully handles missing or invalid files.
 */
export async function autoLoadBundledDebugPreset(): Promise<void> {
  const isDev = import.meta.env.DEV
  if (isDev) return

  try {
    const response = await fetch('/roid-debug-preset.json')
    if (!response.ok) return

    const parsed = (await response.json()) as DebugPresetFileV1

    applyDebugPresetFromParsed(parsed)
  } catch {
    return
  }
}
