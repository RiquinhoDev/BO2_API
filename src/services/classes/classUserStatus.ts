export type HotmartStatus = 'ACTIVE' | 'INACTIVE'

/**
 * Pure domain: the combined/hotmart status patch applied to every student when a
 * class is toggled active/inactive. No I/O — shared by the classInactivation
 * vertical and available to any caller that needs the same status shape.
 */
export function buildClassUserStatusUpdate(
  isActive: boolean,
): Record<'combined.status' | 'hotmart.status', HotmartStatus> {
  const status: HotmartStatus = isActive ? 'ACTIVE' : 'INACTIVE'
  return {
    'combined.status': status,
    'hotmart.status': status,
  }
}
