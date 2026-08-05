import { createUserListController } from '../../controllers/users/userList.controller'
import { UserListService } from './userList.service'
import { MongooseUserListReader } from './mongooseUserList.reader'

const service = new UserListService(new MongooseUserListReader())

export const listUsers = createUserListController(service)
