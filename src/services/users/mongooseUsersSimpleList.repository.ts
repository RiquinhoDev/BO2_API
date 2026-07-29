import type { FilterQuery } from 'mongoose'
import mongoose from 'mongoose'
import User, { type IUser } from '../../models/user'
import type {
  UsersSimpleListRepository,
  UsersSimpleListRepositoryInput,
  UsersSimpleListRepositoryResult,
  UsersSimpleListSource,
} from './usersSimpleList.service'

const USER_SIMPLE_LIST_PROJECTION = {
  _id: 1,
  name: 1,
  email: 1,
  username: 1,
  classId: 1,
  status: 1,
  estado: 1,
  role: 1,
  type: 1,
  purchaseDate: 1,
  lastAccessDate: 1,
  acceptedTerms: 1,
  plusAccess: 1,
  hotmartUserId: 1,
  curseducaUserId: 1,
  discordIds: 1,
  engagement: 1,
  accessCount: 1,
  progress: 1,
  'hotmart.hotmartUserId': 1,
  'hotmart.engagement.engagementLevel': 1,
  'hotmart.engagement.accessCount': 1,
  'hotmart.engagement.engagementScore': 1,
  'hotmart.progress.completedLessons': 1,
  'hotmart.progress.lessonsData': 1,
  'hotmart.progress.totalTimeMinutes': 1,
  'curseduca.curseducaUserId': 1,
  'curseduca.engagement.engagementLevel': 1,
  'curseduca.engagement.accessCount': 1,
  'curseduca.engagement.alternativeEngagement': 1,
  'curseduca.progress.estimatedProgress': 1,
  'combined.engagement': 1,
  'combined.combinedEngagement': 1,
  'combined.totalProgress': 1,
} as const

type MongooseUsersSimpleListSource = Omit<
  UsersSimpleListSource,
  '_id' | 'className'
> & {
  _id: mongoose.Types.ObjectId
}

function buildFilter(
  status: UsersSimpleListRepositoryInput['status'],
): FilterQuery<IUser> {
  const notDeleted: FilterQuery<IUser> = {
    $or: [
      { isDeleted: { $exists: false } },
      { isDeleted: false },
    ],
  }

  if (status === 'active') {
    return {
      $and: [
        notDeleted,
        {
          $or: [
            { status: 'ACTIVE' },
            { estado: { $regex: /^(ativo|active)$/i } },
          ],
        },
      ],
    }
  }

  if (status === 'inactive') {
    return {
      $and: [
        notDeleted,
        {
          $nor: [
            { status: 'ACTIVE' },
            { estado: { $regex: /^(ativo|active)$/i } },
          ],
        },
      ],
    }
  }

  return notDeleted
}

export type UsersSimpleListClassNameLoader = (
  classIds: string[],
) => Promise<Map<string, string>>

const loadClassNames: UsersSimpleListClassNameLoader = async (classIds) => {
  const classes = mongoose.connection.db?.collection('classes')
  if (classIds.length === 0 || !classes) return new Map()

  const classNames = new Map<string, string>()
  const records = await classes
    .find({ classId: { $in: classIds } })
    .project({ _id: 0, classId: 1, name: 1 })
    .toArray()

  for (const record of records) {
    if (typeof record.classId === 'string' && typeof record.name === 'string') {
      classNames.set(record.classId, record.name)
    }
  }

  return classNames
}

export class MongooseUsersSimpleListRepository
implements UsersSimpleListRepository {
  constructor(
    private readonly classNameLoader: UsersSimpleListClassNameLoader =
      loadClassNames,
  ) {}

  async list(
    input: UsersSimpleListRepositoryInput,
  ): Promise<UsersSimpleListRepositoryResult> {
    if (!Number.isInteger(input.limit) || input.limit <= 0) {
      throw new RangeError('users simple list requires a positive limit')
    }

    const filter = buildFilter(input.status)
    const [users, total] = await Promise.all([
      User.find(filter)
        .select(USER_SIMPLE_LIST_PROJECTION)
        .sort({ _id: 1 })
        .skip(input.skip)
        .limit(input.limit)
        .maxTimeMS(120_000)
        .lean<MongooseUsersSimpleListSource[]>()
        .exec(),
      User.countDocuments(filter).maxTimeMS(120_000).exec(),
    ])
    const classIds = [...new Set(
      users
        .map((user) => user.classId)
        .filter((classId): classId is string =>
          typeof classId === 'string' && classId.trim() !== ''),
    )]
    const classNames = await this.classNameLoader(classIds)

    return {
      users: users.map((user) => ({
        ...user,
        _id: user._id.toString(),
        className: user.classId
          ? classNames.get(user.classId) ?? null
          : null,
      })),
      total,
    }
  }
}
