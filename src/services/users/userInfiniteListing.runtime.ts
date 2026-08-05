import { createUserInfiniteListingController } from '../../controllers/users/userInfiniteListing.controller'
import { MongooseUserInfiniteListingReader } from './mongooseUserInfiniteListing.reader'
import { UserInfiniteListingService } from './userInfiniteListing.service'

const service = new UserInfiniteListingService(new MongooseUserInfiniteListingReader())

export const getUsersInfinite = createUserInfiniteListingController(service)
