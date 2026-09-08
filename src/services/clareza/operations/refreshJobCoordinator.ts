import { randomUUID } from 'crypto'

export type RefreshJobState<TResult> =
  | { status: 'idle' }
  | { status: 'running'; startedAt: string; resumed: boolean; completedItems: number }
  | { status: 'interrupted'; startedAt: string; interruptedAt: string; completedItems: number }
  | { status: 'succeeded'; startedAt: string; finishedAt: string; result: TResult; completedItems: number }
  | { status: 'failed'; startedAt: string; finishedAt: string; completedItems: number }

export type RefreshJobStart<TResult> = RefreshJobState<TResult> & {
  reused: boolean
  resumed?: boolean
}

export interface RefreshJobExecutionContext {
  readonly startedAt: string
  readonly completedItems: readonly string[]
  assertLease(): Promise<void>
  markCompleted(item: string): Promise<void>
}

export interface RefreshJobClaim<TResult> {
  readonly acquired: boolean
  readonly resumed: boolean
  readonly state: RefreshJobState<TResult>
  readonly completedItems: readonly string[]
}

export interface RefreshJobStore<TResult> {
  claim(ownerId: string, startedAt: string, leaseMs: number): Promise<RefreshJobClaim<TResult>>
  read(): Promise<RefreshJobState<TResult>>
  renew(ownerId: string, leaseMs: number): Promise<boolean>
  owns(ownerId: string): Promise<boolean>
  checkpoint(ownerId: string, item: string): Promise<boolean>
  complete(ownerId: string, finishedAt: string, result: TResult): Promise<boolean>
  fail(ownerId: string, finishedAt: string): Promise<boolean>
}

export class RefreshJobLeaseLostError extends Error {
  constructor() {
    super('Refresh job lease lost')
    this.name = 'RefreshJobLeaseLostError'
  }
}

export class RefreshJobAlreadyRunningError extends Error {
  constructor() {
    super('Refresh job already running')
    this.name = 'RefreshJobAlreadyRunningError'
  }
}

export class InMemoryRefreshJobStore<TResult> implements RefreshJobStore<TResult> {
  private state: RefreshJobState<TResult> = { status: 'idle' }
  private ownerId: string | null = null
  private leaseUntil = 0
  private completed = new Set<string>()

  constructor(private readonly now: () => number = Date.now) {}

  async claim(ownerId: string, startedAt: string, leaseMs: number): Promise<RefreshJobClaim<TResult>> {
    this.interruptExpiredLease()
    if (this.ownerId && this.leaseUntil > this.now()) {
      return { acquired: false, resumed: false, state: this.copyState(), completedItems: [...this.completed] }
    }

    const resumed = this.state.status === 'interrupted'
    if (!resumed) this.completed.clear()
    const effectiveStartedAt = this.state.status === 'interrupted'
      ? this.state.startedAt
      : startedAt
    this.ownerId = ownerId
    this.leaseUntil = this.now() + leaseMs
    this.state = {
      status: 'running',
      startedAt: effectiveStartedAt,
      resumed,
      completedItems: this.completed.size,
    }
    return { acquired: true, resumed, state: this.copyState(), completedItems: [...this.completed] }
  }

  async read(): Promise<RefreshJobState<TResult>> {
    this.interruptExpiredLease()
    return this.copyState()
  }

  async renew(ownerId: string, leaseMs: number): Promise<boolean> {
    if (!await this.owns(ownerId)) return false
    this.leaseUntil = this.now() + leaseMs
    return true
  }

  async owns(ownerId: string): Promise<boolean> {
    this.interruptExpiredLease()
    return this.ownerId === ownerId && this.leaseUntil > this.now()
  }

  async checkpoint(ownerId: string, item: string): Promise<boolean> {
    if (!await this.owns(ownerId)) return false
    this.completed.add(item)
    if (this.state.status === 'running') this.state = { ...this.state, completedItems: this.completed.size }
    return true
  }

  async complete(ownerId: string, finishedAt: string, result: TResult): Promise<boolean> {
    if (!await this.owns(ownerId) || this.state.status !== 'running') return false
    this.state = {
      status: 'succeeded',
      startedAt: this.state.startedAt,
      finishedAt,
      result,
      completedItems: this.completed.size,
    }
    this.ownerId = null
    this.leaseUntil = 0
    this.completed.clear()
    return true
  }

  async fail(ownerId: string, finishedAt: string): Promise<boolean> {
    if (!await this.owns(ownerId) || this.state.status !== 'running') return false
    this.state = {
      status: 'failed',
      startedAt: this.state.startedAt,
      finishedAt,
      completedItems: this.completed.size,
    }
    this.ownerId = null
    this.leaseUntil = 0
    return true
  }

  private interruptExpiredLease(): void {
    if (this.state.status !== 'running' || !this.ownerId || this.leaseUntil > this.now()) return
    this.state = {
      status: 'interrupted',
      startedAt: this.state.startedAt,
      interruptedAt: new Date(this.now()).toISOString(),
      completedItems: this.completed.size,
    }
    this.ownerId = null
    this.leaseUntil = 0
  }

  private copyState(): RefreshJobState<TResult> {
    return { ...this.state }
  }
}

interface RefreshJobCoordinatorOptions {
  readonly leaseMs?: number
  readonly heartbeatMs?: number
  readonly ownerId?: () => string
  readonly now?: () => number
}

export class RefreshJobCoordinator<TResult> {
  private readonly leaseMs: number
  private readonly heartbeatMs: number
  private readonly ownerId: () => string
  private readonly now: () => number

  constructor(
    private readonly run: (context: RefreshJobExecutionContext) => Promise<TResult>,
    private readonly onError: (error: unknown) => void = () => undefined,
    private readonly store: RefreshJobStore<TResult> = new InMemoryRefreshJobStore<TResult>(),
    options: RefreshJobCoordinatorOptions = {},
  ) {
    this.leaseMs = options.leaseMs ?? 30_000
    this.heartbeatMs = options.heartbeatMs ?? 10_000
    this.ownerId = options.ownerId ?? randomUUID
    this.now = options.now ?? Date.now
  }

  async start(): Promise<RefreshJobStart<TResult>> {
    const launch = await this.claim()
    if (!launch.claim.acquired) return { ...launch.claim.state, reused: true }
    void this.runOwned(launch.ownerId, launch.claim).catch(this.onError)
    return { ...launch.claim.state, reused: false, resumed: launch.claim.resumed }
  }

  async execute(): Promise<TResult> {
    const launch = await this.claim()
    if (!launch.claim.acquired) throw new RefreshJobAlreadyRunningError()
    return this.runOwned(launch.ownerId, launch.claim)
  }

  status(): Promise<RefreshJobState<TResult>> {
    return this.store.read()
  }

  private async claim(): Promise<{ ownerId: string; claim: RefreshJobClaim<TResult> }> {
    const ownerId = this.ownerId()
    const startedAt = new Date(this.now()).toISOString()
    const claim = await this.store.claim(ownerId, startedAt, this.leaseMs)
    return { ownerId, claim }
  }

  private async runOwned(ownerId: string, claim: RefreshJobClaim<TResult>): Promise<TResult> {
    let leaseLost = false
    const heartbeat = setInterval(() => {
      void this.store.renew(ownerId, this.leaseMs).then(renewed => {
        if (!renewed) leaseLost = true
      }).catch(error => {
        leaseLost = true
        this.onError(error)
      })
    }, this.heartbeatMs)
    heartbeat.unref?.()

    const assertLease = async (): Promise<void> => {
      if (leaseLost || !await this.store.owns(ownerId)) throw new RefreshJobLeaseLostError()
    }
    const context: RefreshJobExecutionContext = {
      startedAt: claim.state.status === 'running' ? claim.state.startedAt : new Date(this.now()).toISOString(),
      completedItems: [...claim.completedItems],
      assertLease,
      markCompleted: async item => {
        if (leaseLost || !await this.store.checkpoint(ownerId, item)) throw new RefreshJobLeaseLostError()
      },
    }

    try {
      const result = await this.run(context)
      await assertLease()
      if (!await this.store.complete(ownerId, new Date(this.now()).toISOString(), result)) {
        throw new RefreshJobLeaseLostError()
      }
      return result
    } catch (error: unknown) {
      await this.store.fail(ownerId, new Date(this.now()).toISOString()).catch(this.onError)
      this.onError(error)
      throw error
    } finally {
      clearInterval(heartbeat)
    }
  }
}
