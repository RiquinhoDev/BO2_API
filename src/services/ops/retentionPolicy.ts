// Quanto tempo guardamos cada tipo de registo. Vive em ambiente porque é uma
// decisão de negócio, não de código — e porque a decisão muda quando o plano da
// base de dados muda.
//
// Regra que governa este ficheiro: **por omissão nada expira**. Uma variável
// por preencher significa "guardar para sempre", nunca "apagar com o valor que
// alguém achou razoável". Apagar dados de clientes tem de ser um acto
// deliberado, escrito, de quem tem autoridade para o fazer.

import { parseBoundedInteger } from '../../config/appConfig'

const DAY_SECONDS = 24 * 60 * 60

export interface RetentionPolicy {
  /**
   * Dias a guardar os registos `PLATFORM_UPDATE` do histórico de utilizador.
   * São 96% da colecção e descrevem "o sync viu um campo mudar na plataforma".
   *
   * Os outros tipos — INACTIVATION, CLASS_CHANGE, STATUS_CHANGE, EMAIL_CHANGE,
   * MANUAL_EDIT — **nunca expiram**, e não há variável que os faça expirar:
   * são a memória do que aconteceu a um aluno, e a reactivação de uma turma
   * depende de encontrar o registo de INACTIVATION pelo seu id.
   */
  readonly platformUpdateDays: number | null
}

function optionalDays(env: NodeJS.ProcessEnv, name: string): number | null {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') return null
  // Mínimo de 30 dias: abaixo disto é quase certo ser engano de quem escreveu,
  // e o engano custa histórico que não volta.
  return parseBoundedInteger(raw, name, { min: 30, max: 3_650, defaultValue: 365 })
}

export function loadRetentionPolicy(
  env: NodeJS.ProcessEnv = process.env,
): RetentionPolicy {
  return {
    platformUpdateDays: optionalDays(env, 'USER_HISTORY_PLATFORM_UPDATE_DAYS'),
  }
}

/**
 * Data a que um registo `PLATFORM_UPDATE` deve desaparecer, ou null quando a
 * política não está definida — e aí o registo fica sem `expiresAt`, que é o que
 * o torna permanente.
 */
export function platformUpdateExpiry(
  now: Date = new Date(),
  policy: RetentionPolicy = loadRetentionPolicy(),
): Date | null {
  if (policy.platformUpdateDays === null) return null
  return new Date(now.getTime() + policy.platformUpdateDays * DAY_SECONDS * 1_000)
}
