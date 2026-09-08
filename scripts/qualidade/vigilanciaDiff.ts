import { classificarSeveridade, diffTags, FotoTag, marcarLotes, mudancaNaLista,
  severidadeDaLista, soAgoraVisivel, tagVigiada } from '../../src/services/renewal/acTagWatch.regras'
import { medirEstado, type Contexto } from '../../src/services/renewal/acTagWatch.context'
import { LISTA_OBRIGATORIA } from '../../src/services/renewal/tagsObrigatorias'

export interface SnapshotRow {
  email: string
  contactId?: string
  syncedAt: Date | null
  tags: FotoTag[]
  naListaAlunosOgi: boolean | null
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SNAPSHOT_ROW')
  return value as Record<string, unknown>
}
function date(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  if (!(typeof value === 'string' || value instanceof Date)) throw new Error('INVALID_SNAPSHOT_DATE')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error('INVALID_SNAPSHOT_DATE')
  return parsed
}
export function parseSnapshot(value: unknown): SnapshotRow[] {
  if (!Array.isArray(value) || value.length > 20_000) throw new Error('INVALID_SNAPSHOT_SIZE')
  const seen = new Set<string>()
  let associations = 0
  return value.map(raw => {
    const row = record(raw)
    if (typeof row.email !== 'string' || !row.email.trim()) throw new Error('INVALID_SNAPSHOT_EMAIL')
    const email = row.email.trim().toLowerCase()
    if (seen.has(email)) throw new Error('DUPLICATE_SNAPSHOT_EMAIL')
    seen.add(email)
    const tags = row.tags
    if (!Array.isArray(tags)) throw new Error('INVALID_SNAPSHOT_TAGS')
    associations += tags.length
    if (associations > 1_000_000) throw new Error('SNAPSHOT_TAG_CAP_EXCEEDED')
    if (row.naListaAlunosOgi != null && typeof row.naListaAlunosOgi !== 'boolean') throw new Error('INVALID_SNAPSHOT_LIST')
    const ids = new Set<string>()
    return {
      email, syncedAt: date(row.syncedAt),
      contactId: row.contactId == null ? undefined : String(row.contactId),
      naListaAlunosOgi: row.naListaAlunosOgi == null ? null : row.naListaAlunosOgi as boolean,
      tags: tags.map(rawTag => {
        const tag = record(rawTag)
        if (!['string', 'number'].includes(typeof tag.tagId) || !String(tag.tagId).trim()
          || typeof tag.nome !== 'string' || !['canonica', 'membresia', 'outra'].includes(String(tag.tipo))) {
          throw new Error('INVALID_SNAPSHOT_TAG')
        }
        if (ids.has(String(tag.tagId))) throw new Error('DUPLICATE_SNAPSHOT_TAG')
        ids.add(String(tag.tagId))
        return { tagId: String(tag.tagId), nome: tag.nome, tipo: tag.tipo as FotoTag['tipo'], aplicadaEm: date(tag.aplicadaEm) }
      }),
    }
  })
}
export interface OwnWrite { email: string; tagId?: string | null; quando: Date }
export function compareSnapshots(before: SnapshotRow[], now: SnapshotRow[],
  context: Pick<Contexto, 'activos' | 'tagDaTurma' | 'paraAluno'>, ownWrites: OwnWrite[] = []) {
  const oldMap = new Map(before.map(row => [row.email, row]))
  const newMap = new Map(now.map(row => [row.email, row]))
  const photoTime = before.reduce<Date | null>((latest, row) => row.syncedAt && (!latest || row.syncedAt > latest) ? row.syncedAt : latest, null)
  const ids = new Set(before.flatMap(row => row.tags.map(tag => tag.tagId)))
  const events: Array<{email: string; alvo: 'tag' | 'lista'; tagId: string; tagNome: string;
    tipo: FotoTag['tipo']; accao: 'aplicada' | 'removida'; quando: Date | null}> = []
  let firstVisible = 0
  for (const email of new Set([...oldMap.keys(), ...newMap.keys()])) {
    const old = oldMap.get(email), current = newMap.get(email)
    const diff = diffTags(old?.tags ?? [], current?.tags ?? [])
    for (const accao of ['aplicada', 'removida'] as const) {
      for (const tag of accao === 'aplicada' ? diff.aplicadas : diff.removidas) {
        if (accao === 'aplicada' && soAgoraVisivel(tag, ids, photoTime)) { firstVisible++; continue }
        if (!tagVigiada(tag, context.tagDaTurma.get(email) ?? null)) continue
        events.push({email, alvo: 'tag', tagId: tag.tagId, tagNome: tag.nome, tipo: tag.tipo, accao,
          quando: accao === 'aplicada' ? tag.aplicadaEm : old?.syncedAt ?? photoTime})
      }
    }
    if (typeof current?.naListaAlunosOgi === 'boolean') {
      const change = mudancaNaLista(old?.naListaAlunosOgi, current.naListaAlunosOgi)
      if (change === 'entrou' || change === 'saiu') events.push({email, alvo: 'lista', tagId: LISTA_OBRIGATORIA.id,
        tagNome: LISTA_OBRIGATORIA.nome, tipo: 'canonica', accao: change === 'entrou' ? 'aplicada' : 'removida',
        quando: old?.syncedAt ?? photoTime})
    }
  }
  if (events.length > 20_000) throw new Error('SNAPSHOT_EVENT_CAP_EXCEEDED')
  const writesByKey = new Map<string, Date[]>()
  for (const write of ownWrites) {
    const key = `${write.email.trim().toLowerCase()}|${write.tagId ?? ''}`
    writesByKey.set(key, [...(writesByKey.get(key) ?? []), write.quando])
  }
  const eventos = marcarLotes(events).map(event => {
    const ctx = context.paraAluno(event.email)
    const verdict = event.alvo === 'lista'
      ? severidadeDaLista(event.accao === 'aplicada' ? 'entrou' : 'saiu', ctx)
      : classificarSeveridade(event, ctx)
    const ours = (writesByKey.get(`${event.email}|${event.tagId}`) ?? []).some(when =>
      !event.quando || Math.abs(when.getTime() - event.quando.getTime()) <= 180 * 60_000)
    return {...event, ...verdict, origem: ours ? 'nosso' : event.lote ? 'automacaoAC' : 'maoHumana'}
  })
  const known = now.filter(row => row.naListaAlunosOgi !== null)
  const estadoDasQuatro = medirEstado(new Map(now.map(row => [row.email, {contactId: row.contactId ?? '', tags:row.tags}])),
    new Set(known.filter(row => row.naListaAlunosOgi).map(row => row.email)), true, {...context, userIdPorEmail:new Map()})
  const porLer = [...context.activos].filter(email => newMap.get(email)?.naListaAlunosOgi == null).length
  estadoDasQuatro.lista = {tem: [...context.activos].filter(email => newMap.get(email)?.naListaAlunosOgi === true).length,
    faltam: [...context.activos].filter(email => newMap.get(email)?.naListaAlunosOgi === false).length, porLer}
  return { espelhoBaseEm: photoTime, alunosActivos: context.activos.size, soAgoraVisiveis: firstVisible, estadoDasQuatro, eventos }
}
