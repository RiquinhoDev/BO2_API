import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import express, { type Request, type RequestHandler } from 'express'
import { HttpError } from './errorHandling'
import logger from '../utils/logger'

export const AC_WEBHOOK_SIGNATURE_HEADER = 'x-activecampaign-signature'
export const AC_WEBHOOK_PROCESSING_LEASE_MS = 10 * 60 * 1000
const AC_WEBHOOK_RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
export const AC_WEBHOOK_PATHS = [
  '/api/webhooks/ac/email-opened',
  '/api/webhooks/ac/link-clicked',
]

const AC_WEBHOOK_BODY_LIMIT = '32kb'
const verifiedFingerprints = new WeakMap<Request, string>()

export interface AcWebhookClaim {
  token: string
}

export interface AcWebhookReplayStore {
  claim(fingerprint: string): Promise<AcWebhookClaim | undefined>
  complete(fingerprint: string, claim: AcWebhookClaim): Promise<void>
  release(fingerprint: string, claim: AcWebhookClaim): Promise<void>
}

export interface AcWebhookSecurity {
  jsonParser: RequestHandler
  urlencodedParser: RequestHandler
  replayGuard: RequestHandler
}

interface CreateAcWebhookSecurityOptions {
  secret?: string
  replayStore?: AcWebhookReplayStore
}

function signatureBytes(value: string): Buffer | undefined {
  const normalized = value.trim().replace(/^sha256=/i, '')
  if (/^[a-f0-9]{64}$/i.test(normalized)) return Buffer.from(normalized, 'hex')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return undefined
  const decoded = Buffer.from(normalized, 'base64')
  return decoded.length === 32 ? decoded : undefined
}

function webhookAuthError(detail: string): HttpError {
  return new HttpError({
    status: 401,
    code: 'INVALID_WEBHOOK_SIGNATURE',
    publicMessage: 'Assinatura de webhook invalida',
    cause: new Error(detail),
  })
}

function verifyRawBody(secret: string | undefined, req: Request, body: Buffer): void {
  if (!secret) {
    throw new HttpError({
      status: 503,
      code: 'WEBHOOK_NOT_CONFIGURED',
      publicMessage: 'Webhook indisponivel',
      cause: new Error('AC_WEBHOOK_SECRET nao configurado'),
    })
  }

  const provided = req.get(AC_WEBHOOK_SIGNATURE_HEADER)
  if (!provided) throw webhookAuthError('assinatura ausente')

  const expected = createHmac('sha256', secret).update(body).digest()
  const received = signatureBytes(provided)
  if (!received || received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw webhookAuthError('assinatura invalida')
  }

  const fingerprint = createHash('sha256')
    .update(req.path)
    .update('\0')
    .update(body)
    .digest('hex')
  verifiedFingerprints.set(req, fingerprint)
}

export function createMongoAcWebhookReplayStore(): AcWebhookReplayStore {
  return {
    async claim(fingerprint) {
      const { default: AcWebhookReceipt } = await import('../models/AcWebhookReceipt')
      await AcWebhookReceipt.init()
      const claimedAt = new Date()
      const claimToken = randomUUID()
      const leaseExpiresAt = new Date(claimedAt.getTime() + AC_WEBHOOK_PROCESSING_LEASE_MS)
      const expiresAt = new Date(claimedAt.getTime() + AC_WEBHOOK_RECEIPT_RETENTION_MS)
      const reclaimed = await AcWebhookReceipt.findOneAndUpdate(
        {
          fingerprint,
          status: 'processing',
          // Legacy receipts stay untouched until old workers are drained and
          // an explicit migration gives them a fenced lease.
          leaseExpiresAt: { $lte: claimedAt },
        },
        {
          $set: {
            claimToken,
            leaseExpiresAt,
            expiresAt,
          },
          $unset: { processedAt: 1 },
        },
        { new: true },
      )
      if (reclaimed) return { token: claimToken }

      try {
        await AcWebhookReceipt.create({
          fingerprint,
          status: 'processing',
          claimToken,
          receivedAt: claimedAt,
          leaseExpiresAt,
          expiresAt,
        })
        return { token: claimToken }
      } catch (error: unknown) {
        if (typeof error !== 'object' || error === null || Reflect.get(error, 'code') !== 11000) {
          throw error
        }
        return undefined
      }
    },
    async complete(fingerprint, claim) {
      const { default: AcWebhookReceipt } = await import('../models/AcWebhookReceipt')
      const completedAt = new Date()
      await AcWebhookReceipt.updateOne(
        { fingerprint, status: 'processing', claimToken: claim.token },
        {
          $set: {
            status: 'processed',
            processedAt: completedAt,
            expiresAt: new Date(completedAt.getTime() + AC_WEBHOOK_RECEIPT_RETENTION_MS),
          },
          $unset: { leaseExpiresAt: 1 },
        },
      )
    },
    async release(fingerprint, claim) {
      const { default: AcWebhookReceipt } = await import('../models/AcWebhookReceipt')
      await AcWebhookReceipt.deleteOne({
        fingerprint,
        status: 'processing',
        claimToken: claim.token,
      })
    },
  }
}

export function createAcWebhookSecurity(
  options: CreateAcWebhookSecurityOptions = {},
): AcWebhookSecurity {
  const replayStore = options.replayStore ?? createMongoAcWebhookReplayStore()
  const verify = (req: Request, _res: unknown, body: Buffer) =>
    verifyRawBody(options.secret, req, body)

  const replayGuard: RequestHandler = async (req, res, next) => {
    const fingerprint = verifiedFingerprints.get(req)
    if (!fingerprint) {
      return next(new HttpError({
        status: 415,
        code: 'UNSUPPORTED_WEBHOOK_BODY',
        publicMessage: 'Formato de webhook nao suportado',
      }))
    }

    try {
      const claim = await replayStore.claim(fingerprint)
      if (!claim) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: 'Webhook ja processado',
        })
      }

      res.once('finish', () => {
        const settle = res.statusCode < 400
          ? replayStore.complete(fingerprint, claim)
          : replayStore.release(fingerprint, claim)
        void settle.catch((error) => logger.error('Falha ao fechar recibo de webhook', { error }))
      })
      return next()
    } catch (error) {
      return next(error)
    }
  }

  return {
    jsonParser: express.json({ limit: AC_WEBHOOK_BODY_LIMIT, verify }),
    urlencodedParser: express.urlencoded({
      extended: true,
      limit: AC_WEBHOOK_BODY_LIMIT,
      verify,
    }),
    replayGuard,
  }
}
