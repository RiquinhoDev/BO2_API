import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { readImportedUsers } from '../../src/services/importedUsersWorkbook'

test('lê a primeira folha XLSX como registos de utilizadores', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-workbook-'))
  const filePath = path.join(directory, 'utilizadores.xlsx')
  const workbook = new ExcelJS.Workbook()
  workbook
    .addWorksheet('utilizadores')
    .addRows([
      ['User ID', 'Qual o e-mail com que te inscreveste no curso?'],
      ['discord-1', 'USER@EXAMPLE.TEST'],
    ])
  workbook.addWorksheet('ignorada').addRows([['User ID'], ['discord-2']])
  await workbook.xlsx.writeFile(filePath)

  try {
    await expect(readImportedUsers(filePath)).resolves.toEqual([
      {
        'User ID': 'discord-1',
        'Qual o e-mail com que te inscreveste no curso?': 'USER@EXAMPLE.TEST',
      },
    ])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('preserva o contrato CSV existente através do parser ExcelJS', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-workbook-'))
  const filePath = path.join(directory, 'utilizadores.csv')
  fs.writeFileSync(
    filePath,
    'User ID,Qual o e-mail com que te inscreveste no curso?\ndiscord-1,user@example.test\n',
    'utf8',
  )

  try {
    await expect(readImportedUsers(filePath)).resolves.toEqual([
      {
        'User ID': 'discord-1',
        'Qual o e-mail com que te inscreveste no curso?': 'user@example.test',
      },
    ])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
