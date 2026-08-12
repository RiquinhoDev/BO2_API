// src/models/user.ts - public User model composition
import logger from '../utils/logger'
import mongoose from 'mongoose'
import { attachUserBehavior } from './user.behavior'
import { userSchemaDefinition } from './user.schema'
import { IUser, IUserModel } from './user.types'

export type { IUser, IUserModel } from './user.types'
export const UserSchema = userSchemaDefinition

attachUserBehavior(UserSchema)

// ðŸ†• ÃNDICES ATUALIZADOS para Curseduca
// Nota: email jÃ¡ tem Ã­ndice automÃ¡tico via unique: true
UserSchema.index({ 'discord.discordIds': 1 })
UserSchema.index({ 'hotmart.hotmartUserId': 1 })
UserSchema.index({ 'curseduca.curseducaUserId': 1 })
UserSchema.index({ 'combined.dataQuality': 1 })
UserSchema.index({ 'combined.combinedEngagement': -1 })
UserSchema.index({ 'metadata.updatedAt': -1 })
UserSchema.index({ classId: 1 }, { name: 'users_class_id' })
// ðŸ’° Ãndices para Guru
const guruSubscriptionsOnly = {
  partialFilterExpression: { guru: { $exists: true } },
}
UserSchema.index(
  { email: 1, _id: 1 },
  { ...guruSubscriptionsOnly, name: 'guru_subscriptions_email' },
)
UserSchema.index(
  { name: 1, _id: 1 },
  { ...guruSubscriptionsOnly, name: 'guru_subscriptions_name' },
)
UserSchema.index(
  { 'guru.updatedAt': 1, _id: 1 },
  { ...guruSubscriptionsOnly, name: 'guru_subscriptions_date' },
)
UserSchema.index(
  { 'guru.status': 1, _id: 1 },
  { ...guruSubscriptionsOnly, name: 'guru_subscriptions_status' },
)

// ðŸ”§ VERIFICAR SE MODELO JÃ EXISTE ANTES DE CRIAR
let UserModel: IUserModel

try {
  UserModel = mongoose.model<IUser, IUserModel>('User')
  logger.info('â™»ï¸ Modelo User jÃ¡ existe, reutilizando...')
} catch (error) {
  UserModel = mongoose.model<IUser, IUserModel>('User', UserSchema)
  logger.info('âœ… Novo modelo User criado com estrutura segregada')
}

export default UserModel
