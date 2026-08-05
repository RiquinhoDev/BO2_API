import { createLegacyUserListController } from '../../controllers/users/legacyUserList.controller'
import { LegacyUserListService } from './legacyUserList.service'
import { MongooseLegacyUserListReader } from './mongooseLegacyUserList.reader'

const service = new LegacyUserListService(new MongooseLegacyUserListReader())

export const listUsers = createLegacyUserListController(service)
