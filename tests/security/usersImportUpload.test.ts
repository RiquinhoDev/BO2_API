import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'
import ExcelJS from 'exceljs'
import request from 'supertest'
import { createApp } from '../../src/app'
import {
  MAX_USERS_IMPORT_BYTES,
  MAX_USERS_IMPORT_UNCOMPRESSED_BYTES,
  createUsersImportUpload,
  removeUploadedFile,
  withUploadedFileCleanup,
} from '../../src/security/usersImportUpload'

function buildUploadApp(uploadDirectory: string) {
  return createApp({
    registerRoutes: (app) => {
      app.get('/health', (_req, res) => res.status(204).end())
      app.post(
        '/api/users/syncDiscordAndHotmart',
        createUsersImportUpload({ uploadDirectory }),
        (req, res) => {
          void removeUploadedFile(req.file).then(() => res.status(204).end())
        },
      )
    },
  })
}

test('rejeita ficheiro acima do limite com 413 e remove temporarios', async () => {
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-upload-'))

  try {
    const response = await request(buildUploadApp(uploadDirectory))
      .post('/api/users/syncDiscordAndHotmart?__bo2_offline_loopback=1')
      .attach('file', Buffer.alloc(MAX_USERS_IMPORT_BYTES + 1), {
        filename: 'demasiado-grande.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

    expect(response.status).toBe(413)
    expect(fs.readdirSync(uploadDirectory)).toEqual([])
  } finally {
    fs.rmSync(uploadDirectory, { recursive: true, force: true })
  }
})

async function validXlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('utilizadores')
  sheet.addRow(['User ID', 'Qual o e-mail com que te inscreveste no curso?'])
  sheet.addRow(['discord-1', 'user@example.test'])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function appendZipEntry(zip: Buffer, name: string, content: Buffer): Buffer {
  const eocdOffset = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocdOffset < 0) throw new Error('EOCD em falta no fixture XLSX')

  const centralSize = zip.readUInt32LE(eocdOffset + 12)
  const centralOffset = zip.readUInt32LE(eocdOffset + 16)
  const entryCount = zip.readUInt16LE(eocdOffset + 10)
  const prefix = zip.subarray(0, centralOffset)
  const existingCentral = zip.subarray(centralOffset, centralOffset + centralSize)
  const filename = Buffer.from(name)
  const compressed = deflateRawSync(content)
  const checksum = crc32(content)

  const localHeader = Buffer.alloc(30)
  localHeader.writeUInt32LE(0x04034b50, 0)
  localHeader.writeUInt16LE(20, 4)
  localHeader.writeUInt16LE(8, 8)
  localHeader.writeUInt32LE(checksum, 14)
  localHeader.writeUInt32LE(compressed.length, 18)
  localHeader.writeUInt32LE(content.length, 22)
  localHeader.writeUInt16LE(filename.length, 26)
  const localEntry = Buffer.concat([localHeader, filename, compressed])

  const centralHeader = Buffer.alloc(46)
  centralHeader.writeUInt32LE(0x02014b50, 0)
  centralHeader.writeUInt16LE(20, 4)
  centralHeader.writeUInt16LE(20, 6)
  centralHeader.writeUInt16LE(8, 10)
  centralHeader.writeUInt32LE(checksum, 16)
  centralHeader.writeUInt32LE(compressed.length, 20)
  centralHeader.writeUInt32LE(content.length, 24)
  centralHeader.writeUInt16LE(filename.length, 28)
  centralHeader.writeUInt32LE(prefix.length, 42)
  const centralEntry = Buffer.concat([centralHeader, filename])

  const nextCentralOffset = prefix.length + localEntry.length
  const nextCentralSize = existingCentral.length + centralEntry.length
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entryCount + 1, 8)
  eocd.writeUInt16LE(entryCount + 1, 10)
  eocd.writeUInt32LE(nextCentralSize, 12)
  eocd.writeUInt32LE(nextCentralOffset, 16)

  return Buffer.concat([prefix, localEntry, existingCentral, centralEntry, eocd])
}

test('rejeita MIME falso mesmo quando o conteúdo é XLSX válido', async () => {
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-upload-'))

  try {
    const response = await request(buildUploadApp(uploadDirectory))
      .post('/api/users/syncDiscordAndHotmart?__bo2_offline_loopback=1')
      .attach('file', await validXlsxBuffer(), {
        filename: 'utilizadores.csv',
        contentType: 'text/csv',
      })

    expect(response.status).toBe(400)
    expect(fs.readdirSync(uploadDirectory)).toEqual([])
  } finally {
    fs.rmSync(uploadDirectory, { recursive: true, force: true })
  }
})

test('rejeita XLSX malformado com 400 sem derrubar o processo', async () => {
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-upload-'))
  const app = buildUploadApp(uploadDirectory)

  try {
    const response = await request(app)
      .post('/api/users/syncDiscordAndHotmart?__bo2_offline_loopback=1')
      .attach('file', Buffer.from('PK\x03\x04isto-nao-e-um-xlsx'), {
        filename: 'malformado.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

    expect(response.status).toBe(400)
    expect(fs.readdirSync(uploadDirectory)).toEqual([])
    await request(app).get('/health?__bo2_offline_loopback=1').expect(204)
  } finally {
    fs.rmSync(uploadDirectory, { recursive: true, force: true })
  }
})

test('rejeita zip-bomb antes de entregar o XLSX ao parser', async () => {
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-upload-'))
  const bomb = appendZipEntry(
    await validXlsxBuffer(),
    'xl/media/bomb.txt',
    Buffer.alloc(MAX_USERS_IMPORT_UNCOMPRESSED_BYTES + 1, 0x41),
  )

  try {
    const response = await request(buildUploadApp(uploadDirectory))
      .post('/api/users/syncDiscordAndHotmart?__bo2_offline_loopback=1')
      .attach('file', bomb, {
        filename: 'zip-bomb.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

    expect(response.status).toBe(400)
    expect(fs.readdirSync(uploadDirectory)).toEqual([])
  } finally {
    fs.rmSync(uploadDirectory, { recursive: true, force: true })
  }
})

test('aceita CSV textual com os headers reais e limpa depois do handler', async () => {
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-upload-'))
  const csv = Buffer.from(
    'User ID,Qual o e-mail com que te inscreveste no curso?\ndiscord-1,user@example.test\n',
  )

  try {
    const response = await request(buildUploadApp(uploadDirectory))
      .post('/api/users/syncDiscordAndHotmart?__bo2_offline_loopback=1')
      .attach('file', csv, { filename: 'utilizadores.csv', contentType: 'text/csv' })

    expect(response.status).toBe(204)
    expect(fs.readdirSync(uploadDirectory)).toEqual([])
  } finally {
    fs.rmSync(uploadDirectory, { recursive: true, force: true })
  }
})

test('rejeita conteúdo arbitrário apresentado como CSV', async () => {
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-upload-'))

  try {
    const response = await request(buildUploadApp(uploadDirectory))
      .post('/api/users/syncDiscordAndHotmart?__bo2_offline_loopback=1')
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'falso.csv',
        contentType: 'text/csv',
      })

    expect(response.status).toBe(400)
    expect(fs.readdirSync(uploadDirectory)).toEqual([])
  } finally {
    fs.rmSync(uploadDirectory, { recursive: true, force: true })
  }
})

test('aceita um XLSX válido e remove-o depois do handler', async () => {
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-upload-'))

  try {
    const response = await request(buildUploadApp(uploadDirectory))
      .post('/api/users/syncDiscordAndHotmart?__bo2_offline_loopback=1')
      .attach('file', await validXlsxBuffer(), {
        filename: 'utilizadores.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

    expect(response.status).toBe(204)
    expect(fs.readdirSync(uploadDirectory)).toEqual([])
  } finally {
    fs.rmSync(uploadDirectory, { recursive: true, force: true })
  }
})

test('aceita no máximo um ficheiro por pedido', async () => {
  const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-upload-'))

  try {
    const response = await request(buildUploadApp(uploadDirectory))
      .post('/api/users/syncDiscordAndHotmart?__bo2_offline_loopback=1')
      .attach('file', await validXlsxBuffer(), {
        filename: 'primeiro.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .attach('file', await validXlsxBuffer(), {
        filename: 'segundo.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

    expect(response.status).toBe(400)
    expect(fs.readdirSync(uploadDirectory)).toEqual([])
  } finally {
    fs.rmSync(uploadDirectory, { recursive: true, force: true })
  }
})

test('remove o temporário mesmo quando o processamento falha', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-upload-'))
  const filePath = path.join(directory, 'temporario.xlsx')
  fs.writeFileSync(filePath, 'temporario')
  const file = { path: filePath } as Express.Multer.File

  try {
    await expect(
      withUploadedFileCleanup(file, async () => {
        throw new Error('falha de processamento')
      }),
    ).rejects.toThrow('falha de processamento')
    expect(fs.existsSync(filePath)).toBe(false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
