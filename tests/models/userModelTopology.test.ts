import User, { UserSchema } from '../../src/models/user'
import { attachUserBehavior } from '../../src/models/user.behavior'
import { userSchemaDefinition } from '../../src/models/user.schema'

test('User model composes one schema definition with focused behavior', () => {
  expect(User.schema).toBe(UserSchema)
  expect(typeof attachUserBehavior).toBe('function')
  expect(userSchemaDefinition).toBeDefined()
  expect(UserSchema.methods.calculateCombinedData).toBeDefined()
  expect(UserSchema.statics.findByEmail).toBeDefined()
})
