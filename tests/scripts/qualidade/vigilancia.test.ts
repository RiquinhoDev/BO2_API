import mongoose from 'mongoose'
import { compareSnapshots, parseSnapshot } from '../../../scripts/qualidade/vigilanciaDiff'
import { validateDevEnvironment, writeSnapshot, withDevDatabase } from '../../../scripts/qualidade/vigilanciaRuntime'
import fs from 'fs'
import os from 'os'
import path from 'path'
const old = '2026-08-30T08:00:00Z'
const tag = (time: string) => ({ tagId: '710', nome: 'Aluno OGI Antigo', tipo: 'outra', aplicadaEm: time })
const ctx = { activos: new Set(['student@example.test']), tagDaTurma: new Map(), paraAluno: () => ({ activo: true, comAcessoPago: true, acessoAte: '2027-01-01', periodosPagos: new Set<string>(), tagsPorPeriodo: new Map<string, number>(), temTimeline: true }) }
test('rejects malformed and duplicate snapshot identities instead of inventing removals', () => {
 expect(() => parseSnapshot({})).toThrow()
 expect(() => parseSnapshot([{ email: 'a@example.test', tags: 'bad' }])).toThrow()
 expect(() => parseSnapshot([{ email: 'a@example.test' }, { email: ' A@example.test ' }])).toThrow()
})
test('distinguishes first visibility and real application; preserves unknown list state', () => {
 const before = parseSnapshot([{email: 'student@example.test', syncedAt: old, tags: []}])
 const visible = parseSnapshot([{email: 'student@example.test', syncedAt: old, tags: [tag('2024-01-01')]}])
 expect(compareSnapshots(before, visible, ctx).eventos).toHaveLength(0)
 const now = parseSnapshot([{email: 'student@example.test', syncedAt: old, tags: [tag('2026-08-30T08:05:01Z')], naListaAlunosOgi: false}])
 expect(compareSnapshots(before, now, ctx).eventos).toEqual([expect.objectContaining({alvo: 'tag', severidade: 'grave'})])
})
test('groups bursts across minute boundary without collapsing event rows', () => {
 const before = parseSnapshot(Array.from({length:10}, (_, i) => ({email: i+'@example.test', syncedAt: old, tags: []})))
 const now = parseSnapshot(before.map((x, i) => ({...x, tags: [tag(i < 5 ? '2026-08-30T08:04:55Z' : '2026-08-30T08:05:01Z')]})))
 const result = compareSnapshots(before, now, ctx)
 expect(result.eventos).toHaveLength(10)
 expect(new Set(result.eventos.map(e => e.lote)).size).toBe(1)
 expect(result.eventos[0].loteTamanho).toBe(10)
})
test('requires explicit local dev database; rejects production and URI option override', () => {
 expect(() => validateDevEnvironment({NODE_ENV:'production'})).toThrow()
 expect(() => validateDevEnvironment({NODE_ENV:'development', MONGO_URI:'mongodb://localhost/prod'})).toThrow()
 expect(() => validateDevEnvironment({NODE_ENV:'development', VIGILANCIA_DEV_MONGO_URI:'mongodb://remote/bo2_test'})).toThrow()
 expect(validateDevEnvironment({NODE_ENV:'test', VIGILANCIA_DEV_MONGO_URI:'mongodb://127.0.0.1:27017/bo2_test'})).toContain('bo2_test')
})
test('snapshot never overwrites an existing file', async () => {
 const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'vigilancia-'))
 const target = path.join(folder, 'snapshot.json')
 try {
  await writeSnapshot(target, [])
  await expect(writeSnapshot(target, [])).rejects.toThrow()
  expect(JSON.parse(fs.readFileSync(target,'utf8'))).toEqual([])
 } finally { fs.rmSync(folder, {recursive:true, force:true}) }
})

test('disconnects after connection failure; never creates indexes or collections', async () => {
 const previous = process.env.VIGILANCIA_DEV_MONGO_URI
 process.env.VIGILANCIA_DEV_MONGO_URI='mongodb://127.0.0.1/bo2_test'
 const connect = jest.spyOn(mongoose,'connect').mockRejectedValue(new Error('synthetic failure'))
 const disconnect = jest.spyOn(mongoose,'disconnect').mockResolvedValue()
 const run = jest.fn()
 try {
  await expect(withDevDatabase(run)).rejects.toThrow('synthetic failure')
  expect(run).not.toHaveBeenCalled()
  expect(connect).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({autoIndex:false,autoCreate:false}))
  expect(disconnect).toHaveBeenCalledTimes(1)
 } finally {
  connect.mockRestore(); disconnect.mockRestore()
  if(previous === undefined) delete process.env.VIGILANCIA_DEV_MONGO_URI
  else process.env.VIGILANCIA_DEV_MONGO_URI=previous
 }
})
test('a missing current list reading remains unknown, without a false departure', () => {
 const before=parseSnapshot([{email:'student@example.test',tags:[],syncedAt:old,naListaAlunosOgi:true}])
 const now=parseSnapshot([{email:'student@example.test',tags:[],syncedAt:old,naListaAlunosOgi:null}])
 const result=compareSnapshots(before,now,ctx)
 expect(result.eventos).toHaveLength(0)
 expect(result.estadoDasQuatro.lista).toEqual({tem:0,faltam:0,porLer:1})
})
test('own writes are matched within the time window only', () => {
 const before=parseSnapshot([{email:'student@example.test',tags:[],syncedAt:old}])
 const now=parseSnapshot([{email:'student@example.test',tags:[tag('2026-08-30T08:05:01Z')],syncedAt:old}])
 expect(compareSnapshots(before,now,ctx,[{email:'student@example.test',tagId:'710',quando:new Date('2026-08-29T08:00:00Z')}]).eventos[0].origem).toBe('maoHumana')
 expect(compareSnapshots(before,now,ctx,[{email:'student@example.test',tagId:'710',quando:new Date(old)}]).eventos[0].origem).toBe('nosso')
})
