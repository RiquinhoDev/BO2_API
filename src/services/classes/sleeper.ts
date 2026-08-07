/** Injected delay port so pagination rate-limiting is provable without real waits. */
export interface Sleeper {
  wait(ms: number): Promise<void>
}

export class RealSleeper implements Sleeper {
  wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
