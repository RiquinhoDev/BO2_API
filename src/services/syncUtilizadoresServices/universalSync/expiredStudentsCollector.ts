import type { ExpiredStudent } from './hotmartExpiration'

/**
 * Per-execution collector of expired students. Dedups by userId (first
 * occurrence wins), preserves insertion order, and never exposes the internal
 * array. A fresh instance per sync run guarantees isolation between executions;
 * clear() resets an existing instance.
 */
export class ExpiredStudentsCollector {
  private readonly students: ExpiredStudent[] = []
  private readonly seen = new Set<string>()

  add(student: ExpiredStudent): void {
    if (this.seen.has(student.userId)) return
    this.seen.add(student.userId)
    this.students.push(student)
  }

  all(): ExpiredStudent[] {
    return [...this.students]
  }

  clear(): void {
    this.students.length = 0
    this.seen.clear()
  }
}
