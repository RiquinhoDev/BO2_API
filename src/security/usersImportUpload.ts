import fs from 'node:fs'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'
import type { RequestHandler } from 'express'
import ExcelJS from 'exceljs'
import multer from 'multer'

export const MAX_USERS_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_USERS_IMPORT_UNCOMPRESSED_BYTES = 50 * 1024 * 1024

export interface UsersImportUploadOptions {
  uploadDirectory?: string
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const CSV_MIMES = new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel'])
const MAX_XLSX_ENTRIES = 1_000

function validateCsvContent(content: Buffer): void {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(content)
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    throw new Error('CSV contém bytes de controlo')
  }
  const header = (text.split(/\r?\n/, 1)[0] ?? '').replace(/^\ufeff/, '').toLowerCase()
  const hasUserId = header.includes('user id') || header.includes('userid')
  const hasEmail = header.includes('email') || header.includes('e-mail')
  if (!hasUserId || !hasEmail) throw new Error('Headers CSV inválidos')
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06])
  const searchFrom = Math.max(0, archive.length - 65_557)
  const offset = archive.lastIndexOf(signature, archive.length - 1)
  return offset >= searchFrom ? offset : -1
}

function validateXlsxArchive(archive: Buffer): void {
  const eocdOffset = findEndOfCentralDirectory(archive)
  if (eocdOffset < 0 || eocdOffset + 22 > archive.length) throw new Error('ZIP inválido')

  const entryCount = archive.readUInt16LE(eocdOffset + 10)
  const centralSize = archive.readUInt32LE(eocdOffset + 12)
  const centralOffset = archive.readUInt32LE(eocdOffset + 16)
  if (
    entryCount === 0 ||
    entryCount > MAX_XLSX_ENTRIES ||
    centralOffset + centralSize > eocdOffset
  ) {
    throw new Error('Estrutura ZIP inválida')
  }

  let cursor = centralOffset
  let expandedBytes = 0
  const names = new Set<string>()

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocdOffset || archive.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Diretório ZIP inválido')
    }

    const flags = archive.readUInt16LE(cursor + 8)
    const method = archive.readUInt16LE(cursor + 10)
    const compressedSize = archive.readUInt32LE(cursor + 20)
    const declaredSize = archive.readUInt32LE(cursor + 24)
    const nameLength = archive.readUInt16LE(cursor + 28)
    const extraLength = archive.readUInt16LE(cursor + 30)
    const commentLength = archive.readUInt16LE(cursor + 32)
    const localOffset = archive.readUInt32LE(cursor + 42)
    const nextCursor = cursor + 46 + nameLength + extraLength + commentLength

    if (
      nextCursor > eocdOffset ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      compressedSize === 0xffffffff ||
      declaredSize === 0xffffffff ||
      declaredSize > MAX_USERS_IMPORT_UNCOMPRESSED_BYTES - expandedBytes
    ) {
      throw new Error('Entrada ZIP insegura')
    }

    const name = archive.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    names.add(name)

    if (localOffset + 30 > centralOffset || archive.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('Entrada ZIP sem header local')
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26)
    const localExtraLength = archive.readUInt16LE(localOffset + 28)
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataOffset + compressedSize
    if (dataEnd > centralOffset) throw new Error('Dados ZIP truncados')

    const compressed = archive.subarray(dataOffset, dataEnd)
    const expanded = method === 0
      ? compressed
      : inflateRawSync(compressed, {
          maxOutputLength: MAX_USERS_IMPORT_UNCOMPRESSED_BYTES - expandedBytes,
        })
    if (expanded.length !== declaredSize) throw new Error('Tamanho ZIP inconsistente')
    expandedBytes += expanded.length
    cursor = nextCursor
  }

  if (
    cursor !== centralOffset + centralSize ||
    !names.has('[Content_Types].xml') ||
    !names.has('xl/workbook.xml') ||
    ![...names].some((name) => name.startsWith('xl/worksheets/'))
  ) {
    throw new Error('Conteúdo XLSX inválido')
  }
}

export async function validateUsersImportFile(file: Express.Multer.File): Promise<void> {
  const content = await fs.promises.readFile(file.path)
  const isZip = content.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  if (!isZip) {
    if (!CSV_MIMES.has(file.mimetype)) throw new Error('Tipo de ficheiro inválido')
    validateCsvContent(content)
    return
  }
  if (file.mimetype !== XLSX_MIME) throw new Error('MIME incompatível com XLSX')

  validateXlsxArchive(content)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file.path)
  if (workbook.worksheets.length === 0) throw new Error('XLSX sem folhas')
}

export async function removeUploadedFile(file?: Express.Multer.File): Promise<void> {
  if (file?.path) await fs.promises.rm(file.path, { force: true })
}

export async function withUploadedFileCleanup<T>(
  file: Express.Multer.File,
  processFile: (filePath: string) => Promise<T>,
): Promise<T> {
  try {
    return await processFile(path.resolve(file.path))
  } finally {
    await removeUploadedFile(file)
  }
}

export function createUsersImportUpload(
  options: UsersImportUploadOptions = {},
): RequestHandler {
  const uploadDirectory = options.uploadDirectory ?? path.resolve('uploads')
  const upload = multer({
    dest: uploadDirectory,
    limits: { fileSize: MAX_USERS_IMPORT_BYTES, files: 1 },
  }).single('file')

  return (req, res, next) => {
    upload(req, res, (error) => {
      if (!error) {
        if (!req.file) return next()
        void validateUsersImportFile(req.file)
          .then(() => next())
          .catch(async () => {
            await removeUploadedFile(req.file)
            res.status(400).json({ message: 'Ficheiro inválido' })
          })
        return
      }

      void removeUploadedFile(req.file).then(() => {
        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ message: 'Ficheiro demasiado grande' })
          return
        }
        res.status(400).json({ message: 'Upload inválido' })
      })
    })
  }
}
