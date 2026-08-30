// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/tagsObrigatorias.ts
// As quatro coisas que um aluno OGI activo tem de ter na
// ActiveCampaign. Fixadas no spec do fluxo nocturno,
// docs/superpowers/specs/2026-08-22-fluxo-nocturno-renovacoes.md:185
//
// Ficheiro puro: sem mongoose, sem axios. É partilhado pelo sync
// do espelho e pela vigilância, e é testável sem ligar a nada.
//
// NÃO tem relação com o subsistema de tags de Janeiro
// (`tagMonitoring`, `CriticalTag`, `tagOrchestrator`). Esse aplica
// tags por produto e actividade; isto é só o inventário do que
// tem de existir.
// ════════════════════════════════════════════════════════════

/**
 * As duas obrigatórias que são tags nomeadas.
 *
 * Identificadas pelo **id** e não pelo nome: o nome na AC pode ser
 * renomeado a qualquer momento e o id não. Medidos a 30/08/2026.
 */
export const TAGS_OBRIGATORIAS = [
  { id: '347', nome: 'Alunos OGI Ativos' },
  { id: '676', nome: 'OGI - Aluno ou Ex-Aluno' }
] as const

/**
 * A terceira obrigatória é a tag da turma actual, que não tem id fixo
 * — muda com a turma. Resolve-se pela timeline, não por aqui.
 *
 * A quarta é esta lista. Não é uma tag: lê-se por
 * `/api/3/contacts?listid=2`, não por `/api/3/tags`.
 */
export const LISTA_OBRIGATORIA = { id: '2', nome: 'Alunos OGI' } as const

/** True quando o id é o de uma das obrigatórias nomeadas. */
export function eTagObrigatoria(tagId: string | number | null | undefined): boolean {
  if (tagId === null || tagId === undefined) return false
  const id = String(tagId)
  return TAGS_OBRIGATORIAS.some((tag) => tag.id === id)
}

/** O nome oficial da obrigatória, para mensagens. Null se não for uma. */
export function nomeDaTagObrigatoria(tagId: string | number | null | undefined): string | null {
  if (tagId === null || tagId === undefined) return null
  const id = String(tagId)
  return TAGS_OBRIGATORIAS.find((tag) => tag.id === id)?.nome ?? null
}
