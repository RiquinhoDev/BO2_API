import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import express, { type Request, type RequestHandler } from 'express'
import { HttpError } from './errorHandling'
import logger from '../utils/logger'

export const AC_WEBHOOK_SIGNATURE_HEADER = 'x-activecampaign-signature'
export const AC_WEBHOOK_PATHS = [
  '/api/webhooks/ac/email-opened',
  '/api/webhooks/ac/link-clicked',
]

const AC_WEBHOOK_BODY_LIMIT = '32kb'
const verifiedFingerprints = new WeakMap<Request, string>()

export interface AcWebhookReplayStore {
  claim(fingerprint: string): Promise<boolean>
  complete(fingerprint: string): Promise<void>
  release(fingerprint: string): Promise<void>
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
      try {
        await AcWebhookReceipt.create({ fingerprint, status: 'processing' })
        return true
      } catch (error: any) {
        if (error?.code === 11000) return false
        throw error
      }
    },
    async complete(fingerprint) {
      const { default: AcWebhookReceipt } = await import('../models/AcWebhookReceipt')
      await AcWebhookReceipt.updateOne(
        { fingerprint },
        { $set: { status: 'processed', processedAt: new Date() } },
      )
    },
    async release(fingerprint) {
      const { default: AcWebhookReceipt } = await import('../models/AcWebhookReceipt')
      await AcWebhookReceipt.deleteOne({ fingerprint, status: 'processing' })
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
      const claimed = await replayStore.claim(fingerprint)
      if (!claimed) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: 'Webhook ja processado',
        })
      }

      res.once('finish', () => {
        const settle = res.statusCode < 400
          ? replayStore.complete(fingerprint)
          : replayStore.release(fingerprint)
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