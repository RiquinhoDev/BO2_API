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

/**
 * Tags de estado que se vigiam sem serem obrigatórias.
 *
 * A `Aluno OGI Antigo` é o outro lado da `Alunos OGI Ativos`: quem perde uma
 * ganha a outra. Não é obrigatória — exigi-la a todos os activos daria
 * centenas de faltas falsas —, mas sem ela a vigilância vê a perda da
 * `Ativos` e não vê para onde a pessoa foi.
 *
 * E não é um fim de linha. É uma passagem: a campanha de recuperação de
 * ex-alunos marca-os `Antigo`, e quem compra vai depois para uma turma de
 * renovação normal, como qualquer renovação.
 */
export const TAGS_ESTADO_VIGIADAS = [{ id: '710', nome: 'Aluno OGI Antigo' }] as const

/** True quando o id é o de uma das obrigatórias nomeadas. */
export function eTagObrigatoria(tagId: string | number | null | undefined): boolean {
  if (tagId === null || tagId === undefined) return false
  const id = String(tagId)
  return TAGS_OBRIGATORIAS.some((tag) => tag.id === id)
}

/** True quando é de estado e vigiada, mas NÃO obrigatória. */
export function eTagEstadoVigiada(tagId: string | number | null | undefined): boolean {
  if (tagId === null || tagId === undefined) return false
  const id = String(tagId)
  return TAGS_ESTADO_VIGIADAS.some((tag) => tag.id === id)
}

/**
 * True para qualquer tag nomeada dentro do escopo da vigilância.
 * A tag da turma actual entra por outro caminho — não tem id fixo.
 */
export function eTagVigiada(tagId: string | number | null | undefined): boolean {
  return eTagObrigatoria(tagId) || eTagEstadoVigiada(tagId)
}

/** O nome oficial da tag vigiada, para mensagens. Null se não for uma. */
export function nomeDaTagObrigatoria(tagId: string | number | null | undefined): string | null {
  if (tagId === null || tagId === undefined) return null
  const id = String(tagId)
  return (
    TAGS_OBRIGATORIAS.find((tag) => tag.id === id)?.nome ??
    TAGS_ESTADO_VIGIADAS.find((tag) => tag.id === id)?.nome ??
    null
  )
}
