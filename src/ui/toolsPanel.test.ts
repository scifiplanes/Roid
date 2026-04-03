import { describe, expect, it } from 'vitest'
import { getPlayerToolForHotkeyCode } from './toolsPanel'

describe('tool hotkeys', () => {
  it('maps Digit1 to pick and KeyQ to cargo drone (TOOLS order)', () => {
    expect(getPlayerToolForHotkeyCode('Digit1')).toBe('pick')
    expect(getPlayerToolForHotkeyCode('KeyQ')).toBe('cargoDrone')
  })

  it('aliases numpad digits to the main row', () => {
    expect(getPlayerToolForHotkeyCode('Numpad1')).toBe('pick')
    expect(getPlayerToolForHotkeyCode('Numpad0')).toBe('lifter')
  })

  it('maps last letter key to EM Catapult', () => {
    expect(getPlayerToolForHotkeyCode('KeyS')).toBe('emCatapult')
  })

  it('returns undefined for unbound codes', () => {
    expect(getPlayerToolForHotkeyCode('KeyZ')).toBeUndefined()
    expect(getPlayerToolForHotkeyCode('F10')).toBeUndefined()
  })
})
