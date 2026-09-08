import fs from 'node:fs'
import path from 'node:path'

test('fila lê janela suficiente antes de deduplicar lotes', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/acTagWatch.routes.ts'),
    'utf8',
  )
  expect(source).toMatch(/AcTagEvent\.find\(query\)[\s\S]*?\.limit\(2000\)/)
})
