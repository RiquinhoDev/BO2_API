import mongoose from 'mongoose'

import type { DateSourceType } from '../../models/product/ProductSalesStats'
import UserProduct from '../../models/UserProduct'
import User from '../../models/user'

type DateValue = Date | string | number

interface SalesUserProduct {
  platform?: string
  enrolledAt?: DateValue | null
  userId: mongoose.Types.ObjectId
}

interface SalesUser {
  hotmart?: {
    purchaseDate?: DateValue | null
    signupDate?: DateValue | null
    firstAccessDate?: DateValue | null
  }
  curseduca?: {
    joinedDate?: DateValue | null
    enrolledClasses?: Array<{ enteredAt?: DateValue | null }>
  }
  discord?: {
    joinedAt?: DateValue | null
    createdAt?: DateValue | null
  }
  metadata?: {
    firstSystemEntry?: Date | null
    createdAt?: DateValue | null
  }
}

async function ensureFirstSystemEntry(userId: mongoose.Types.ObjectId): Promise<Date> {
  const user = await User.findById(userId)
  if (!user) return new Date()
  if (user.metadata?.firstSystemEntry) return user.metadata.firstSystemEntry

  const possibleDates: Date[] = []
  if (user.hotmart?.purchaseDate) possibleDates.push(new Date(user.hotmart.purchaseDate))
  if (user.hotmart?.signupDate) possibleDates.push(new Date(user.hotmart.signupDate))
  if (user.hotmart?.firstAccessDate) possibleDates.push(new Date(user.hotmart.firstAccessDate))
  if (user.curseduca?.joinedDate) possibleDates.push(new Date(user.curseduca.joinedDate))
  if (user.curseduca?.enrolledClasses?.[0]?.enteredAt) {
    possibleDates.push(new Date(user.curseduca.enrolledClasses[0].enteredAt))
  }
  if (user.discord?.createdAt) possibleDates.push(new Date(user.discord.createdAt))
  if (user.metadata?.createdAt) possibleDates.push(new Date(user.metadata.createdAt))

  const [oldestEnrollment] = await UserProduct.find({ userId }).sort({ enrolledAt: 1 }).limit(1)
  if (oldestEnrollment?.enrolledAt) possibleDates.push(new Date(oldestEnrollment.enrolledAt))

  const firstEntry = possibleDates.length > 0
    ? new Date(Math.min(...possibleDates.map((date) => date.getTime())))
    : new Date()

  await User.updateOne({ _id: userId }, { $set: { 'metadata.firstSystemEntry': firstEntry } })
  return firstEntry
}

export async function determineSaleDate(
  userProduct: SalesUserProduct,
  user: SalesUser,
): Promise<{ date: Date; source: DateSourceType }> {
  if (userProduct.platform === 'hotmart') {
    if (user.hotmart?.purchaseDate) return { date: new Date(user.hotmart.purchaseDate), source: 'purchaseDate' }
    if (userProduct.enrolledAt) return { date: new Date(userProduct.enrolledAt), source: 'enrolledAt' }
    if (user.hotmart?.signupDate) return { date: new Date(user.hotmart.signupDate), source: 'purchaseDate' }
    if (user.metadata?.firstSystemEntry) return { date: new Date(user.metadata.firstSystemEntry), source: 'firstSystemEntry' }
  }

  if (userProduct.platform === 'curseduca') {
    if (user.curseduca?.joinedDate) return { date: new Date(user.curseduca.joinedDate), source: 'joinedDate' }
    if (userProduct.enrolledAt) return { date: new Date(userProduct.enrolledAt), source: 'enrolledAt' }
    const enteredAt = user.curseduca?.enrolledClasses?.[0]?.enteredAt
    if (enteredAt) return { date: new Date(enteredAt), source: 'joinedDate' }
    if (user.metadata?.firstSystemEntry) return { date: new Date(user.metadata.firstSystemEntry), source: 'firstSystemEntry' }
  }

  if (userProduct.platform === 'discord') {
    if (userProduct.enrolledAt) return { date: new Date(userProduct.enrolledAt), source: 'enrolledAt' }
    if (user.discord?.joinedAt) return { date: new Date(user.discord.joinedAt), source: 'joinedServer' }
    if (user.metadata?.firstSystemEntry) return { date: new Date(user.metadata.firstSystemEntry), source: 'firstSystemEntry' }
    if (user.discord?.createdAt) return { date: new Date(user.discord.createdAt), source: 'createdAt' }
  }

  return { date: await ensureFirstSystemEntry(userProduct.userId), source: 'firstSystemEntry' }
}
