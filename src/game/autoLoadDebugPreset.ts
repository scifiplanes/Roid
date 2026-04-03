/**
 * Previously fetched `public/roid-debug-preset.json` on every production load.
 * Replaced by deploy-scoped resets from bundled `*.persisted.json` in
 * `maybeApplyBundledProjectDefaultsOnProductionStartup` (`applyBundledDefaultsOnNewDeploy.ts`).
 * Settings → Import debug preset still applies `roid-debug-preset.json` manually.
 */
export async function autoLoadBundledDebugPreset(): Promise<void> {
  return Promise.resolve()
}
