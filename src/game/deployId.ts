/** Written after bundled defaults are applied for this deploy id. */
export const LAST_APPLIED_DEPLOY_ID_STORAGE_KEY = 'roid:lastAppliedDeployId'

export function getDeployId(): string {
  return import.meta.env.VITE_DEPLOY_ID
}
