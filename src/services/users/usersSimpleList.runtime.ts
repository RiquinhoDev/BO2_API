import { createUsersSimpleListController } from '../../controllers/usersSimpleList.controller'
import { MongooseUsersSimpleListRepository } from './mongooseUsersSimpleList.repository'
import { UsersSimpleListService } from './usersSimpleList.service'

const repository = new MongooseUsersSimpleListRepository()
const service = new UsersSimpleListService(repository)

export const listUsersSimple = createUsersSimpleListController(service)
