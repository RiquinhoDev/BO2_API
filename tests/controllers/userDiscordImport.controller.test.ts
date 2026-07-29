import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import express, { type RequestHandler } from 'express'
import request from 'supertest'
import { createUserDiscordImportController } from '../../src/controllers/userDiscordImport.controller'
import type {
  DiscordIdentityImportInput,
  DiscordIdentityImportResult,
  DiscordIdentityImportService,
} from '../../src/services/users/discordIdentityImport.service'
import { createErrorHandling } from '../../src/security/errorHandling'

type ImportService = Pick<DiscordIdentityImportService, 'execute'>

function uploadedFile(filePath: string): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'identities.csv',
    encoding: '7bit',
    mimetype: 'text/csv',
    size: 12,
    destination: path.dirname(filePath),
    filename: path.basename(filePath),
    path: filePath,
    buffer: Buffer.alloc(0),
    stream: fs.createReadStream(filePath),
  }
}

function buildApp(
  service: ImportService,
  file?: Express.Multer.File,
): express.Application {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'discord-import-test',
    logError: () => undefined,
  })
  app.use(errors.correlationId)
  app.use(express.json())
  app.post(
    '/import',
    ((req, _res, next) => {
      req.user = {
        id: 'admin-1',
        email: 'admin@example.test',
        role: 'ADMIN',
        permissions: [],
      }
      req.file = file
      next()
    }) satisfies RequestHandler,
    createUserDiscordImportController(service),
  )
  app.use(errors.handler)
  return app
}

test('requires an uploaded file before invoking the import service', async () => {
  const execute = jest.fn<
    Promise<DiscordIdentityImportResult>,
    [DiscordIdentityImportInput]
  >()

  const response = await request(buildApp({ execute }))
    .post('/import?__bo2_offline_loopback=1')
    .expect(400)

  expect(response.body).toEqual({
    success: false,
    code: 'UPLOAD_FILE_REQUIRED',
    message: 'Nenhum ficheiro carregado',
    correlationId: 'discord-import-test',
  })
  expect(execute).not.toHaveBeenCalled()
})

test('uses the authenticated principal and preserves the success envelope', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-import-'))
  const filePath = path.join(directory, 'upload.csv')
  fs.writeFileSync(filePath, 'User ID,email')
  const execute = jest.fn<
    Promise<DiscordIdentityImportResult>,
    [DiscordIdentityImportInput]
  >().mockResolvedValue({
    syncId: 'sync-1',
    stats: { added: 1, unmatched: 2, errors: 0 },
  })

  try {
    const response = await request(buildApp({ execute }, uploadedFile(filePath)))
      .post('/import?__bo2_offline_loopback=1')
      .send({ user: 'attacker@example.test' })
      .expect(200)

    expect(execute).toHaveBeenCalledWith({
      filePath: path.resolve(filePath),
      originalName: 'identities.csv',
      actorEmail: 'admin@example.test',
    })
    expect(response.body).toEqual({
      message: 'Sincronização concluída',
      syncId: 'sync-1',
      stats: { added: 1, unmatched: 2, errors: 0 },
    })
    expect(fs.existsSync(filePath)).toBe(false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('cleans the upload and forwards a stable error after service failure', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'discord-import-'))
  const filePath = path.join(directory, 'upload.csv')
  fs.writeFileSync(filePath, 'User ID,email')
  const execute = jest.fn<
    Promise<DiscordIdentityImportResult>,
    [DiscordIdentityImportInput]
  >().mockRejectedValue(new Error('database unavailable'))

  try {
    const response = await request(buildApp({ execute }, uploadedFile(filePath)))
      .post('/import?__bo2_offline_loopback=1')
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      code: 'USER_IMPORT_FAILED',
      message: 'Erro na sincronização',
      correlationId: 'discord-import-test',
    })
    expect(fs.existsSync(filePath)).toBe(false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
