import { z } from 'zod'
import type {
  UsersV2LegacyQuery,
  UsersV2LegacyResponseFilters,
} from '../contracts/usersV2'
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

function parseOptional<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> | undefined {
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

const legacyPage = positiveInteger.default('1').catch(1)
const legacyLimit = positiveInteger
  .default('50')
  .transform(value => Math.min(value, 100))
  .catch(50)
const legacyProductId = z.string().regex(/^[a-f\d]{24}$/i)
const legacySearch = z.string().trim().min(1).max(200)
const legacyDateTime = z.string().datetime({ offset: true })
const legacyString = z.string()

const legacyQuery = z.object({
  page: z.unknown().optional(),
  limit: z.unknown().optional(),
  platform: z.unknown().optional(),
  productId: z.unknown().optional(),
  status: z.unknown().optional(),
  search: z.unknown().optional(),
  progressLevel: z.unknown().optional(),
  engagementLevel: z.unknown().optional(),
  minEngagement: z.unknown().optional(),
  maxEngagement: z.unknown().optional(),
  lastAccessBefore: z.unknown().optional(),
  enrolledAfter: z.unknown().optional(),
  topPercentage: z.unknown().optional(),
}).passthrough().transform((query): UsersV2LegacyQuery => {
  const canonicalPlatform = parseOptional(platform, query.platform)
  const canonicalProductId = parseOptional(legacyProductId, query.productId)
  const canonicalStatus = parseOptional(status, query.status)
  const canonicalSearch = parseOptional(legacySearch, query.search)
  const canonicalProgressLevel = parseOptional(
    progressLevel,
    query.progressLevel,
  )
  const canonicalEngagementLevel = parseOptional(
    engagementLevel,
    query.engagementLevel,
  )
  const canonicalMinEngagement = parseOptional(
    integerPercent,
    query.minEngagement,
  )
  const canonicalMaxEngagement = parseOptional(
    integerPercent,
    query.maxEngagement,
  )
  const canonicalLastAccessBefore = parseOptional(
    legacyDateTime,
    query.lastAccessBefore,
  )
  const canonicalEnrolledAfter = parseOptional(
    legacyDateTime,
    query.enrolledAfter,
  )
  const rawPlatform = parseOptional(legacyString, query.platform)
  const rawProductId = parseOptional(legacyString, query.productId)
  const rawStatus = parseOptional(legacyString, query.status)
  const rawSearch = parseOptional(legacyString, query.search)
  const rawProgressLevel = parseOptional(legacyString, query.progressLevel)
  const rawEngagementLevel = parseOptional(legacyString, query.engagementLevel)
  const rawMaxEngagement = parseOptional(legacyString, query.maxEngagement)
  const rawTopPercentage = parseOptional(legacyString, query.topPercentage)
  const rawLastAccessBefore = parseOptional(
    legacyString,
    query.lastAccessBefore,
  )
  const rawEnrolledAfter = parseOptional(legacyString, query.enrolledAfter)

  const responseFilters: UsersV2LegacyResponseFilters = {
    ...(canonicalPlatform !== undefined && rawPlatform !== undefined
      ? { platform: rawPlatform }
      : {}),
    ...(canonicalProductId !== undefined && rawProductId !== undefined
      ? { productId: rawProductId }
      : {}),
    ...(canonicalStatus !== undefined && rawStatus !== undefined
      ? { status: rawStatus }
      : {}),
    ...(canonicalSearch !== undefined && rawSearch !== undefined
      ? { search: rawSearch }
      : {}),
    ...(canonicalProgressLevel !== undefined && rawProgressLevel !== undefined
      ? { progressLevel: rawProgressLevel }
      : {}),
    ...(
      canonicalEngagementLevel !== undefined
      && rawEngagementLevel !== undefined
        ? { engagementLevel: rawEngagementLevel }
        : {}
    ),
    ...(canonicalMaxEngagement !== undefined && rawMaxEngagement !== undefined
      ? { maxEngagement: rawMaxEngagement }
      : {}),
    ...(rawTopPercentage !== undefined
      ? { topPercentage: rawTopPercentage }
      : {}),
    ...(
      canonicalLastAccessBefore !== undefined
      && rawLastAccessBefore !== undefined
        ? { lastAccessBefore: rawLastAccessBefore }
        : {}
    ),
    ...(canonicalEnrolledAfter !== undefined && rawEnrolledAfter !== undefined
      ? { enrolledAfter: rawEnrolledAfter }
      : {}),
  }

  return {
    canonical: {
      page: parseOptional(legacyPage, query.page) ?? 1,
      limit: parseOptional(legacyLimit, query.limit) ?? 50,
      ...(canonicalPlatform !== undefined
        ? { platform: canonicalPlatform }
        : {}),
      ...(canonicalProductId !== undefined
        ? { productId: canonicalProductId }
        : {}),
      ...(canonicalStatus !== undefined ? { status: canonicalStatus } : {}),
      ...(canonicalSearch !== undefined ? { search: canonicalSearch } : {}),
      ...(canonicalProgressLevel !== undefined
        ? { progressLevel: canonicalProgressLevel }
        : {}),
      ...(canonicalEngagementLevel !== undefined
        ? { engagementLevel: canonicalEngagementLevel }
        : {}),
      ...(rawTopPercentage !== undefined
        ? { minEngagement: 77 }
        : canonicalMinEngagement !== undefined
          ? { minEngagement: canonicalMinEngagement }
          : {}),
      ...(rawTopPercentage === undefined && canonicalMaxEngagement !== undefined
        ? { maxEngagement: canonicalMaxEngagement }
        : {}),
      ...(canonicalLastAccessBefore !== undefined
        ? { lastAccessBefore: canonicalLastAccessBefore }
        : {}),
      ...(canonicalEnrolledAfter !== undefined
        ? { enrolledAfter: canonicalEnrolledAfter }
        : {}),
    },
    responseFilters,
  }
})

export const usersV2LegacyInput = z.object({
  params: z.object({}).strict(),
  query: legacyQuery,
  body: z.object({}).strict(),
}).strict()
