import type { RedisRefreshJobCommandPort } from '../../cache.service'
import type {
  RefreshJobClaim,
  RefreshJobState,
  RefreshJobStore,
} from './refreshJobCoordinator'

export type { RedisRefreshJobCommandPort } from '../../cache.service'

const STATE_TTL_SECONDS = 7 * 24 * 60 * 60

const CLAIM_SCRIPT = `
local lease = redis.call('GET', KEYS[1])
local raw = redis.call('GET', KEYS[2])
if lease then
  return {0, 0, raw or '{"status":"idle"}'}
end
local resumed = 0
local startedAt = ARGV[2]
if raw then
  local previous = cjson.decode(raw)
  if previous.status == 'running' or previous.status == 'interrupted' then
    resumed = 1
    startedAt = previous.startedAt
  end
end
if resumed == 0 then redis.call('DEL', KEYS[3]) end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
local completed = redis.call('SCARD', KEYS[3])
local state = cjson.encode({status='running', startedAt=startedAt, resumed=(resumed == 1), completedItems=completed})
redis.call('SETEX', KEYS[2], ARGV[4], state)
redis.call('EXPIRE', KEYS[3], ARGV[4])
local items = redis.call('SMEMBERS', KEYS[3])
local result = {1, resumed, state}
for _, item in ipairs(items) do table.insert(result, item) end
return result
`

const READ_SCRIPT = `
local raw = redis.call('GET', KEYS[2])
if not raw then return '{"status":"idle"}' end
local state = cjson.decode(raw)
if state.status == 'running' and not redis.call('GET', KEYS[1]) then
  state.status = 'interrupted'
  state.interruptedAt = ARGV[1]
  state.resumed = nil
  raw = cjson.encode(state)
  redis.call('SETEX', KEYS[2], ARGV[2], raw)
end
return raw
`

const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`

const OWNS_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return 1 end
return 0
`

const CHECKPOINT_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SADD', KEYS[3], ARGV[2])
redis.call('EXPIRE', KEYS[3], ARGV[3])
local raw = redis.call('GET', KEYS[2])
if raw then
  local state = cjson.decode(raw)
  state.completedItems = redis.call('SCARD', KEYS[3])
  redis.call('SETEX', KEYS[2], ARGV[3], cjson.encode(state))
end
return 1
`

const COMPLETE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local raw = redis.call('GET', KEYS[2])
if not raw then return 0 end
local state = cjson.decode(raw)
if state.status ~= 'running' then return 0 end
state.status = 'succeeded'
state.finishedAt = ARGV[2]
state.result = cjson.decode(ARGV[3])
state.resumed = nil
state.completedItems = redis.call('SCARD', KEYS[3])
redis.call('SETEX', KEYS[2], ARGV[4], cjson.encode(state))
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[3])
return 1
`

const FAIL_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local raw = redis.call('GET', KEYS[2])
if not raw then return 0 end
local state = cjson.decode(raw)
if state.status ~= 'running' then return 0 end
state.status = 'failed'
state.finishedAt = ARGV[2]
state.resumed = nil
state.completedItems = redis.call('SCARD', KEYS[3])
redis.call('SETEX', KEYS[2], ARGV[3], cjson.encode(state))
redis.call('EXPIRE', KEYS[3], ARGV[3])
redis.call('DEL', KEYS[1])
return 1
`

function parseState<TResult>(raw: unknown): RefreshJobState<TResult> {
  if (typeof raw !== 'string') throw new Error('Redis refresh job state returned an invalid result')
  const state: unknown = JSON.parse(raw)
  if (!state || typeof state !== 'object' || typeof (state as { status?: unknown }).status !== 'string') {
    throw new Error('Redis refresh job state returned an invalid result')
  }
  return state as RefreshJobState<TResult>
}

export class RedisRefreshJobStore<TResult> implements RefreshJobStore<TResult> {
  private readonly keys: readonly [string, string, string]

  constructor(
    private readonly redis: RedisRefreshJobCommandPort,
    prefix = 'clareza:jobs:raiox-refresh',
  ) {
    this.keys = [`${prefix}:lease`, `${prefix}:state`, `${prefix}:completed`]
  }

  async claim(ownerId: string, startedAt: string, leaseMs: number): Promise<RefreshJobClaim<TResult>> {
    const raw = await this.redis.eval(CLAIM_SCRIPT, this.keys, [
      ownerId, startedAt, String(leaseMs), String(STATE_TTL_SECONDS),
    ])
    if (!Array.isArray(raw) || raw.length < 3) {
      throw new Error('Redis refresh job claim returned an invalid result')
    }
    const state = parseState<TResult>(raw[2])
    return {
      acquired: Number(raw[0]) === 1,
      resumed: Number(raw[1]) === 1,
      state,
      completedItems: raw.slice(3).map(String).sort(),
    }
  }

  async read(): Promise<RefreshJobState<TResult>> {
    const raw = await this.redis.eval(READ_SCRIPT, this.keys, [
      new Date().toISOString(), String(STATE_TTL_SECONDS),
    ])
    return parseState<TResult>(raw)
  }

  async renew(ownerId: string, leaseMs: number): Promise<boolean> {
    return Number(await this.redis.eval(RENEW_SCRIPT, [this.keys[0]], [ownerId, String(leaseMs)])) === 1
  }

  async owns(ownerId: string): Promise<boolean> {
    return Number(await this.redis.eval(OWNS_SCRIPT, [this.keys[0]], [ownerId])) === 1
  }

  async checkpoint(ownerId: string, item: string): Promise<boolean> {
    return Number(await this.redis.eval(CHECKPOINT_SCRIPT, this.keys, [
      ownerId, item, String(STATE_TTL_SECONDS),
    ])) === 1
  }

  async complete(ownerId: string, finishedAt: string, result: TResult): Promise<boolean> {
    return Number(await this.redis.eval(COMPLETE_SCRIPT, this.keys, [
      ownerId, finishedAt, JSON.stringify(result), String(STATE_TTL_SECONDS),
    ])) === 1
  }

  async fail(ownerId: string, finishedAt: string): Promise<boolean> {
    return Number(await this.redis.eval(FAIL_SCRIPT, this.keys, [
      ownerId, finishedAt, String(STATE_TTL_SECONDS),
    ])) === 1
  }
}
