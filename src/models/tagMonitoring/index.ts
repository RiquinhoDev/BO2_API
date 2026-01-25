/**
 * Tag Monitoring System Models
 * Sistema de Monitorização e Notificação de Tags Nativas da ActiveCampaign
 */

export { default as CriticalTag, ICriticalTag } from './CriticalTag'
export {
  default as WeeklyNativeTagSnapshot,
  IWeeklyNativeTagSnapshot,
  TagChanges,
} from './WeeklyNativeTagSnapshot'
export {
  default as TagChangeNotification,
  ITagChangeNotification,
} from './TagChangeNotification'
export { default as TagChangeDetail, ITagChangeDetail } from './TagChangeDetail'
export {
  default as WeeklyTagMonitoringConfig,
  IWeeklyTagMonitoringConfig,
} from './WeeklyTagMonitoringConfig'
