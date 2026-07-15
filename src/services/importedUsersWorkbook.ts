import fs from 'node:fs'
import ExcelJS, { type Worksheet } from 'exceljs'
import type { ImportedUserRecord } from '../types/ImportedUserRecord'

function worksheetToRecords(worksheet: Worksheet): ImportedUserRecord[] {
  const headers: string[] = []
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column] = cell.text.trim()
  })

  const records: ImportedUserRecord[] = []
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber)
    const record: Record<string, string> = {}
    let hasValue = false

    for (let column = 1; column < headers.length; column += 1) {
      const header = headers[column]
      if (!header) continue
      const value = row.getCell(column).text
      if (value !== '') hasValue = true
      record[header] = value
    }

    if (hasValue) records.push(record as ImportedUserRecord)
  }
  return records
}

export async function readImportedUsers(filePath: string): Promise<ImportedUserRecord[]> {
  const workbook = new ExcelJS.Workbook()
  const signature = Buffer.alloc(4)
  const handle = await fs.promises.open(filePath, 'r')
  try {
    await handle.read(signature, 0, signature.length, 0)
  } finally {
    await handle.close()
  }

  const worksheet = signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    ? (await workbook.xlsx.readFile(filePath)).worksheets[0]
    : await workbook.csv.readFile(filePath)
  if (!worksheet) throw new Error('XLSX sem folhas')
  return worksheetToRecords(worksheet)
}
