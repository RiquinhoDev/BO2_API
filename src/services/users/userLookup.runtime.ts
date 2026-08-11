import {
  createGetUserByEmailController,
  createGetUserByIdController,
  createGetUserProductsController,
} from '../../controllers/users/userLookup.controller'
import {
  MongooseUserProductsReader,
  UserProductsServiceEnrichedUserByEmailReader,
  UserProductsServiceEnrichedUserReader,
} from './mongooseUserLookup.reader'

export const getUserById = createGetUserByIdController(
  new UserProductsServiceEnrichedUserReader(),
)

export const getUserProducts = createGetUserProductsController(
  new MongooseUserProductsReader(),
)

export const getUserByEmail = createGetUserByEmailController(
  new UserProductsServiceEnrichedUserByEmailReader(),
)
