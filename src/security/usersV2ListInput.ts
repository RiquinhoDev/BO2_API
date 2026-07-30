import { z } from 'zod'
import { validatedSchema } from './validatedInput'

const positiveInteger = z.string()
  .regex(/^[1-9]\d*$/)
  .transform(value => Number(value))

const integerPercent = z.string()
  .regex(/^\d+$/)
  .transform(value => Number(value))
  .refine(value => value >= 0 && value <= 100)

const lowercase = (value: unknown): unknown =>
  typeof value === 'string' ? value.toLowerCase() : value

const platform = z.preprocess(
  lowercase,
  z.enum(['hotmart', 'curseduca', 'discord']),
)

const status = z.enum([
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'CANCELLED',
  'PARA_INATIVAR',
])

const progressLevel = z.enum([
  'MUITO_BAIXO',
  'BAIXO',
  'MEDIO',
  'ALTO',
  'MUITO_ALTO',
])

const engagementLevel = z.preprocess(value => {
  if (typeof value !== 'string') return value
  return value.split(',').map(level => level.trim())
}, z.array(z.enum([
  'NONE',
  'MUITO_BAIXO',
  'BAIXO',
  'MEDIO',
  'ALTO',
  'MUITO_ALTO',
])).min(1))

const canonicalQuery = {
  page: positiveInteger.default('1'),
  limit: positiveInteger.default('50').transform(value => Math.min(value, 200)),
  platform: platform.optional(),
  productId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  status: status.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  progressLevel: progressLevel.optional(),
  engagementLevel: engagementLevel.optional(),
  minEngagement: integerPercent.optional(),
  maxEngagement: integerPercent.optional(),
  lastAccessBefore: z.string().datetime({ offset: true }).optional(),
  enrolledAfter: z.string().datetime({ offset: true }).optional(),
}

export const usersV2EnrollmentInput = validatedSchema({
  params: {},
  query: canonicalQuery,
  body: {},
}).superRefine((input, context) => {
  const { minEngagement, maxEngagement } = input.query
  if (
    minEngagement !== undefined
    && maxEngagement !== undefined
    && minEngagement > maxEngagement
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'INVALID_REQUEST',
      path: ['query', 'minEngagement'],
    })
  }
})

export const usersV2OverviewAnalyticsInput = validatedSchema({
  params: {},
  query: {},
  body: {},
})

const legacyQuery = z.object({
  page: positiveInteger.default('1'),
  limit: positiveInteger.default('50').transform(value => Math.min(value, 100)),
  platform: platform.optional(),
  productId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  status: status.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  progressLevel: progressLevel.optional(),
  engagementLevel: engagementLevel.optional(),
  minEngagement: integerPercent.optional(),
  maxEngagement: integerPercent.optional(),
  lastAccessBefore: z.string().datetime({ offset: true }).optional(),
  enrolledAfter: z.string().datetime({ offset: true }).optional(),
  topPercentage: z.unknown().optional(),
}).passthrough().transform(query => ({
  page: query.page,
  limit: query.limit,
  platform: query.platform,
  productId: query.productId,
  status: query.status,
  search: query.search,
  progressLevel: query.progressLevel,
  engagementLevel: query.engagementLevel,
  minEngagement: query.topPercentage === undefined ? query.minEngagement : 77,
  maxEngagement: query.maxEngagement,
  lastAccessBefore: query.lastAccessBefore,
  enrolledAfter: query.enrolledAfter,
}))

export const usersV2LegacyInput = z.object({
  params: z.object({}).strict(),
  query: legacyQuery,
  body: z.object({}).strict(),
}).strict()
