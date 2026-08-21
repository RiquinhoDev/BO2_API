// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/turmaTagResolver.ts
// Nome da turma → nome da tag que essa turma devia ter na AC.
// Puro: as excepções entram por parâmetro, não são lidas da BD.
//
// Duas camadas, por esta ordem:
//
//   1. excepção   o que está em `turmatagmap` manda sempre
//   2. convenção  Turma N | YYMM         → Aluno OGI LYYMM - Turma N
//                 Turma N [renov] | YYMM → Aluno OGI YYMM - Renovação Turma N
//                 Turma Renovação | YYMM → Aluno OGI YYMM - Renovação
//
// Quando nenhuma resolve, devolve null com um motivo. NUNCA
// inventa um nome: uma tag errada aqui propaga-se a um alerta
// falso na ficha do aluno.
//
// Detalhe que morde: a turma escreve "[2 anos]" com espaço, a tag
// escreve "[2anos]" sem espaço.
// ════════════════════════════════════════════════════════════

import { parseTurmaName } from './turmaParser'

export interface ResolucaoTag {
  tagNome: string | null
  origem: 'excepcao' | 'convencao' | null
  /** Porque é que não resolveu. null quando resolveu. */
  motivo: 'sem-periodo' | 'sem-numero-turma' | 'turma-agrupada' | null
}

/** Chave de comparação de nomes de turma: sem caixa, sem espaços a mais. */
export function normalizarNomeTurma(s: string): string {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim()
}

const MENCIONA_RENOVACAO = /renova(ç|c)(ã|a)o/i

export function resolverTagDaTurma(
  className: string,
  excepcoes: Map<string, string> = new Map()
): ResolucaoTag {
  const excepcao = excepcoes.get(normalizarNomeTurma(className))
  if (excepcao) return { tagNome: excepcao, origem: 'excepcao', motivo: null }

  const parsed = parseTurmaName(className)
  if (!parsed.periodYYMM) return { tagNome: null, origem: null, motivo: 'sem-periodo' }

  const sufixo = parsed.accessYears === 2 ? ' [2anos]' : ''
  const ehRenovacao = parsed.isRenov || MENCIONA_RENOVACAO.test(className)

  if (parsed.turmaNumbers.length > 1) {
    return { tagNome: null, origem: null, motivo: 'turma-agrupada' }
  }

  if (ehRenovacao) {
    // Formato novo ("Turma Renovação | 2606") não tem número nenhum.
    const nome =
      parsed.turmaNumbers.length === 1
        ? `Aluno OGI ${parsed.periodYYMM} - Renovação Turma ${parsed.turmaNumbers[0]}${sufixo}`
        : `Aluno OGI ${parsed.periodYYMM} - Renovação${sufixo}`
    return { tagNome: nome, origem: 'convencao', motivo: null }
  }

  if (parsed.turmaNumbers.length === 0) {
    return { tagNome: null, origem: null, motivo: 'sem-numero-turma' }
  }

  return {
    tagNome: `Aluno OGI L${parsed.periodYYMM} - Turma ${parsed.turmaNumbers[0]}${sufixo}`,
    origem: 'convencao',
    motivo: null
  }
}
