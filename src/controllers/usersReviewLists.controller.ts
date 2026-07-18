import type { Request, Response } from 'express'
import IdsDiferentes from '../models/IdsDiferentes'
import UnmatchedUser from '../models/UnmatchedUser'
import { paginate } from '../utils/pagination'

const IDS_DIFERENTES_PROJECTION =
  '_id email previousDiscordIds newDiscordId detectedAt createdAt updatedAt __v'

const UNMATCHED_USERS_PROJECTION =
  '_id discordId username email name detectedAt createdAt updatedAt __v'

const STABLE_DETECTED_AT_SORT = {
  detectedAt: -1,
  _id: -1,
} as const

export const getIdsDiferentes = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const pagination = paginate(req.query)
    const [idsDiferentes, total] = await Promise.all([
      IdsDiferentes.find({})
        .sort(STABLE_DETECTED_AT_SORT)
        .select(IDS_DIFERENTES_PROJECTION)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      IdsDiferentes.countDocuments({}),
    ])

    res.json({
      idsDiferentes,
      pagination: pagination.metadata(total),
    })
  } catch (error: any) {
    res.status(500).json({
      message: 'Erro ao buscar IDs diferentes',
      details: error.message,
    })
  }
}

export const getUnmatchedUsers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const pagination = paginate(req.query)
    const [unmatchedUsers, total] = await Promise.all([
      UnmatchedUser.find({})
        .sort(STABLE_DETECTED_AT_SORT)
        .select(UNMATCHED_USERS_PROJECTION)
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      UnmatchedUser.countDocuments({}),
    ])

    res.status(200).json({
      unmatchedUsers,
      pagination: pagination.metadata(total),
    })
  } catch (error: any) {
    res.status(500).json({
      message: 'Erro ao buscar utilizadores não correspondidos',
      details: error.message,
    })
  }
}
