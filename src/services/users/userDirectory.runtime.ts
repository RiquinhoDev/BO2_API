import { createUserDirectoryController } from '../../controllers/users/userDirectory.controller'
import { MongooseUserDirectoryReader } from './mongooseUserDirectory.reader'
import { UserDirectoryService } from './userDirectory.service'

const service = new UserDirectoryService(new MongooseUserDirectoryReader())

export const getAllUsersUnified = createUserDirectoryController(service)
