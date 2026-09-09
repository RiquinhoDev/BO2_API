// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/esperaDeTurma.ts
// Quem está na sala de espera fica na fila até sair dela.
//
// A Turma Renovação Genérica não é um destino: o aluno entra lá ao
// renovar e é movido para a coorte do mês semanas depois, já passado
// o prazo de reembolso. Enquanto lá está não leva tag — a genérica
// não tem período no nome, e dar-lhe a tag da coorte anterior seria
// mentir (regra 5.6).
//
// Sair da genérica é o acontecimento que torna a tag devida. E não
// gera venda nenhuma, logo não gera evento de compra. Sem isto, quem
// comprou antes de o detector existir ficava na genérica para sempre
// sem nunca receber tag: medido a 09/09/2026, 16 alunos, um deles lá
// há 370 dias.
//
// Não é corrigir o passado — é uma obrigação que ainda não venceu.
// ════════════════════════════════════════════════════════════

import RenewalEvent, { chaveDoEvento } from '../../models/renewal/RenewalEvent'
import { eTurmaGenerica } from './acTurmaTagSync.service'

export interface AlunoNaGenerica {
  userId: unknown
  email: string
  turma: string | null
}

export interface EsperaDeTurmaReport {
  naGenerica: number
  jaTinhamEvento: number
  criados: number
  erros: number
}

/** Só quem está mesmo na sala de espera. */
export function filtrarNaGenerica<T extends { turma: string | null }>(alunos: T[]): T[] {
  return alunos.filter((aluno) => eTurmaGenerica(aluno.turma))
}

/**
 * Garante um evento aberto por cada aluno na genérica.
 *
 * A chave não leva data para que o mesmo aluno na mesma sala de espera
 * dê sempre o mesmo evento — corridas repetidas não enchem a fila. Quando
 * ele for movido e a tag for aplicada, o evento fecha; se voltar à
 * genérica numa renovação futura, é a compra que abre o evento novo.
 */
export async function abrirEsperasDeTurma(
  alunos: AlunoNaGenerica[],
  agora: Date = new Date()
): Promise<EsperaDeTurmaReport> {
  const naGenerica = filtrarNaGenerica(alunos)
  const report: EsperaDeTurmaReport = {
    naGenerica: naGenerica.length,
    jaTinhamEvento: 0,
    criados: 0,
    erros: 0
  }

  for (const aluno of naGenerica) {
    const chave = chaveDoEvento('espera-turma', String(aluno.userId), null, null)
    try {
      const existente = await (RenewalEvent as any)
        .findOne({ chave, 'tratado.tagTurma': null })
        .select('_id')
        .lean()
        .exec()
      if (existente) {
        report.jaTinhamEvento += 1
        continue
      }
      await (RenewalEvent as any).create({
        userId: aluno.userId,
        email: aluno.email,
        tipo: 'espera-turma',
        transacao: null,
        data: null,
        produtoId: null,
        detectadoEm: agora,
        tratado: { expiracao: null, tagTurma: null, reembolso: null },
        chave
      })
      report.criados += 1
    } catch (error: any) {
      // 11000 é o evento já fechado de uma espera anterior: a chave é a
      // mesma e não se reabre. O aluno já foi tratado uma vez.
      if (error?.code === 11000) report.jaTinhamEvento += 1
      else report.erros += 1
    }
  }

  return report
}
