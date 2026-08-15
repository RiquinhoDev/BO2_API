import fs from 'node:fs'
import path from 'node:path'

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function between(value: string, start: string, end: string): string {
  const startIndex = value.indexOf(start)
  const endIndex = value.indexOf(end, startIndex + start.length)
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Unable to isolate source segment: ${start} -> ${end}`)
  }
  return value.slice(startIndex, endIndex)
}

describe('OPS-02 replay repair ordering', () => {
  test('Guru active replay repairs stale Guru-marked inactivation even after a partial prior run', () => {
    const value = source('src/services/guru/sync/orchestration.ts')

    expect(value).toContain('if (!newEffectiveSync.isCanceled) {')
    expect(value).not.toContain('prevEffective.isCanceled && !newEffectiveSync.isCanceled')
  })

  test('Hotmart complete sync updates user state before appending movement history', () => {
    const value = source('src/services/classes/mongooseHotmartClassSync.writer.ts')
    const method = between(value, '  async applyUserSync(', '  async syncCompleteClass(')
    const userWrite = method.indexOf('await User.findByIdAndUpdate(localUser._id')
    const historyWrite = method.indexOf('await StudentClassHistory.create({')

    expect(userWrite).toBeGreaterThanOrEqual(0)
    expect(historyWrite).toBeGreaterThanOrEqual(0)
    expect(userWrite).toBeLessThan(historyWrite)
  })

  test('expired trial processing marks dependent products before committing terminal user state', () => {
    const value = source('src/services/guru/guruTrialService.ts')
    const branch = between(
      value,
      '// Trial expirou sem conversão → marcar para inativação',
      '} catch (error: unknown)',
    )
    const productWrite = branch.indexOf('await markUserProductsForInactivation')
    const userWrite = branch.indexOf("user.set('guru.isTrial', false)")

    expect(productWrite).toBeGreaterThanOrEqual(0)
    expect(userWrite).toBeGreaterThanOrEqual(0)
    expect(productWrite).toBeLessThan(userWrite)
  })

  test('trial provider-active paths repair stale trial inactivation marks', () => {
    const value = source('src/services/guru/guruTrialService.ts')
    const checkExpired = between(
      value,
      'export async function checkExpiredTrials()',
      '// ─────────────────────────────────────────────────────────────\n// SYNC TRIALS DA API GURU',
    )
    const repairs = checkExpired.match(/await revertUserProductsFromTrialInactivation\(user\._id\)/g) ?? []

    expect(repairs).toHaveLength(2)
  })

  test('CursEduca cleanup records remote situation before removing the pending repair record', () => {
    const value = source('src/services/guru/guruInactivationMaintenance.service.ts')
    const branch = between(
      value,
      'if (remote?.ok && !isCurseducaEnrollmentActive(remote.value.situation)) {',
      'result.kept += 1',
    )
    const situationWrite = branch.indexOf('await repository.updateUserSituation')
    const pendingWrite = branch.indexOf('await repository.markInactive')

    expect(situationWrite).toBeGreaterThanOrEqual(0)
    expect(pendingWrite).toBeGreaterThanOrEqual(0)
    expect(situationWrite).toBeLessThan(pendingWrite)
  })
})
