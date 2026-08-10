import {
  createGetUserByIdController,
  createGetUserProductsController,
} from '../../controllers/users/userLookup.controller'
import {
  MongooseUserProductsReader,
  UserProductsServiceEnrichedUserReader,
} from './mongooseUserLookup.reader'

export const getUserById = createGetUserByIdController(
  new UserProductsServiceEnrichedUserReader(),
)

export const getUserProducts = createGetUserProductsController(
  new MongooseUserProductsReader(),
)
