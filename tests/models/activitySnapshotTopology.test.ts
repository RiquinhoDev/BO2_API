import fs from 'fs'
import path from 'path'
import mongoose from 'mongoose'
import ActivitySnapshot from '../../src/models/SyncModels/ActivitySnapshot'
import type {
  IActivitySnapshot,
  IActivitySnapshotMethods,
  IActivitySnapshotModel,
  IProgressSnapshot,
  Platform,
  SnapshotSource,
} from '../../src/models/SyncModels/ActivitySnapshot'

describe('ActivitySnapshot model topology', () => {
  it('keeps the facade focused while preserving public contracts and model identity', () => {
    const facadePath = path.resolve(
      process.cwd(),
      'src/models/SyncModels/ActivitySnapshot.ts',
    )
    const physicalLines = fs.readFileSync(facadePath, 'utf8').split(/\r?\n/).length
    const acceptsPublicContracts = (
      _snapshot: IActivitySnapshot,
      _methods: IActivitySnapshotMethods,
      _model: IActivitySnapshotModel,
      _progress: IProgressSnapshot,
      _platform: Platform,
      _source: SnapshotSource,
    ): void => undefined

    expect(physicalLines).toBeLessThanOrEqual(500)
    expect(typeof acceptsPublicContracts).toBe('function')
    expect(ActivitySnapshot.modelName).toBe('ActivitySnapshot')
    expect(mongoose.models.ActivitySnapshot).toBe(ActivitySnapshot)
  })
})
