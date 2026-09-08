import { main as snapshot } from '../../../scripts/qualidade/fotografar-espelho'
import { main as diff } from '../../../scripts/qualidade/diff-espelho-tags'
import { main as dryRun } from '../../../scripts/qualidade/dry-run-vigilancia'
import * as runtime from '../../../scripts/qualidade/vigilanciaRuntime'
import { correrAcTagWatch } from '../../../src/services/renewal/acTagWatch.service'
jest.mock('../../../scripts/qualidade/vigilanciaRuntime', () => ({
  withDevDatabase: jest.fn(async (run: () => Promise<unknown>) => run()),
  readMirror: jest.fn(async () => []), writeSnapshot: jest.fn(), readSnapshot: jest.fn(), failCli: jest.fn(),
}))
jest.mock('../../../src/services/renewal/acTagWatch.service', () => ({ correrAcTagWatch: jest.fn() }))
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(console, 'log').mockImplementation(() => {}) })
afterEach(() => jest.restoreAllMocks())
test('missing arguments stop before opening a database', async () => {
  await expect(snapshot([])).rejects.toThrow('USAGE')
  await expect(diff([])).rejects.toThrow('USAGE')
  await expect(dryRun(['--write'])).rejects.toThrow('USAGE')
  expect(runtime.withDevDatabase).not.toHaveBeenCalled()
})
test('photograph reads mirror and writes only the requested snapshot', async () => {
  await snapshot(['snapshot.json'])
  expect(runtime.readMirror).toHaveBeenCalledTimes(1)
  expect(runtime.writeSnapshot).toHaveBeenCalledWith('snapshot.json', [])
})
test('sensitivity always calls canonical service in dry run without refreshing mirror', async () => {
  jest.mocked(correrAcTagWatch).mockResolvedValue({dryRun:true, eventosGravados:0, errors:[]} as never)
  await dryRun(['--sensibilidade'])
  expect(correrAcTagWatch).toHaveBeenCalledTimes(3)
  for (const limiarLote of [3,5,10]) expect(correrAcTagWatch).toHaveBeenCalledWith({dryRun:true, actualizarEspelho:false, limiarLote})
  expect(runtime.withDevDatabase).toHaveBeenCalledWith(expect.any(Function), true)
})
test('partial report stops instead of reporting a successful audit', async () => {
  jest.mocked(correrAcTagWatch).mockResolvedValue({dryRun:true, eventosGravados:0, errors:[{}]} as never)
  await expect(dryRun([])).rejects.toThrow('INCOMPLETE')
})
