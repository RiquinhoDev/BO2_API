import type { Request, Response } from 'express'
import { GURU_SSO_ALLOWED_STATUSES } from '../types/guru.types'
import logger from '../utils/logger'
import { paginate } from '../utils/pagination'

const SUBSCRIPTION_PROJECTION = 'email name guru'

const SORT_FIELDS = {
  email: 'email',
  name: 'name',
  date: 'guru.updatedAt',
  status: 'guru.status',
} as const

type SubscriptionSortField = keyof typeof SORT_FIELDS

interface LeanGuruUser {
  email: string
  name?: string
  guru?: {
    status?: string
    [key: string]: unknown
  }
}

interface SubscriptionFindQuery {
  select(projection: string): SubscriptionFindQuery
  sort(sort: Record<string, 1 | -1>): SubscriptionFindQuery
  skip(skip: number): SubscriptionFindQuery
  limit(limit: number): SubscriptionFindQuery
  lean(): PromiseLike<LeanGuruUser[]>
}

interface SubscriptionUserModel {
  find(query: Record<string, unknown>): SubscriptionFindQuery
  countDocuments(query: Record<string, unknown>): PromiseLike<number>
}

interface SubscriptionListDependencies {
  model: unknown
}

const isSortField = (value: unknown): value is SubscriptionSortField =>
  typeof value === 'string' && value in SORT_FIELDS

const subscriptionSort = (
  sortField: unknown,
  sortDirection: unknown,
): Record<string, 1 | -1> => {
  if (!isSortField(sortField)) {
    return { 'guru.updatedAt': -1, _id: -1 }
  }

  const direction = sortDirection === 'asc' ? 1 : -1
  return {
    [SORT_FIELDS[sortField]]: direction,
    _id: direction,
  }
}

export const createListSubscriptions = ({
  model,
}: SubscriptionListDependencies) => async (req: Request, res: Response) => {
  const User = model as SubscriptionUserModel

  try {
    const {
      status,
      productId,
      email,
      dateFrom,
      dateTo,
      sortField,
      sortDirection,
    } = req.query
    const pagination = paginate(req.query)
    const query: Record<string, unknown> = { guru: { $exists: true } }

    if (status) {
      query['guru.status'] = status
    }
    if (productId) {
      query['guru.productId'] = productId
    }
    if (email && typeof email === 'string' && email.trim()) {
      const escaped = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.email = { $regex: escaped, $options: 'i' }
    }
    if (dateFrom || dateTo) {
      const range: { $gte?: Date; $lte?: Date } = {}
      if (dateFrom) range.$gte = new Date(String(dateFrom))
      if (dateTo) {
        const end = new Date(String(dateTo))
        end.setHours(23, 59, 59, 999)
        range.$lte = end
      }
      query['guru.updatedAt'] = range
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select(SUBSCRIPTION_PROJECTION)
        .sort(subscriptionSort(sortField, sortDirection))
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      User.countDocuments(query),
    ])

    const subscriptions = users.map((user) => ({
      email: user.email,
      name: user.name,
      ...user.guru,
      canAccessSSO: GURU_SSO_ALLOWED_STATUSES.some(
        (allowedStatus) => allowedStatus === user.guru?.status,
      ),
    }))

    return res.json({
      success: true,
      subscriptions,
      pagination: pagination.metadata(total),
    })
  } catch (error: any) {
    logger.error('[GURU] Erro ao listar subscrições', { error })
    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}
