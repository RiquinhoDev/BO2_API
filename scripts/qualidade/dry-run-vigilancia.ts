import { failCli, withDevDatabase } from './vigilanciaRuntime'
export async function main(args = process.argv.slice(2)) {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--sensibilidade')) throw new Error('USAGE: dry-run-vigilancia.ts [--sensibilidade]')
  await withDevDatabase(async () => {
    const { correrAcTagWatch } = await import('../../src/services/renewal/acTagWatch.service')
    for (const limiarLote of args.includes('--sensibilidade') ? [3, 5, 10] : [10]) {
      const report = await correrAcTagWatch({ dryRun: true, actualizarEspelho: false, limiarLote })
      if (report.errors.length || !report.dryRun || report.eventosGravados) throw new Error('VIGILANCIA_DRY_RUN_INCOMPLETE')
      console.log(JSON.stringify({ limiarLote, report }, null, 2))
    }
  }, true)
}
if (require.main === module) void main().catch(failCli)
