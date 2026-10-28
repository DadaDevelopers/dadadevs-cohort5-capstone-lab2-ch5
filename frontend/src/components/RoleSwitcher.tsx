/**
 * Retained temporarily so older imports fail closed during the integration.
 * Live routes no longer expose role impersonation; authorization comes from
 * the authenticated backend user and their community membership.
 */
export function RoleSwitcher() {
  return null
}
