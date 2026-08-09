import UserProduct from '../../src/models/UserProduct'

// Regression net for the duplicated enrollment index: { userId: 1, productId: 1 }
// was declared twice — once plain ("Buscar enrollment específico") and once with
// { unique: true }. The unique one is canonical (one enrollment per user/product),
// so the plain declaration must go. Schema-only — no Mongo.

const isEnrollmentKey = (keys: Record<string, unknown>): boolean =>
  Object.keys(keys).length === 2 && keys.userId === 1 && keys.productId === 1

describe('UserProduct enrollment index', () => {
  it('imports the model without emitting a duplicate-index warning for {userId,productId}', () => {
    const emitWarning = jest.spyOn(process, 'emitWarning')
    // Re-compile in isolation so the duplicate-index check runs again (the top
    // import already registered the model on the shared mongoose instance).
    jest.isolateModules(() => {
      require('../../src/models/UserProduct')
    })

    const duplicateWarnings = emitWarning.mock.calls
      .map((args) => String(args[0]))
      .filter(
        (message) =>
          message.includes('Duplicate schema index') &&
          message.includes('userId') &&
          message.includes('productId'),
      )

    expect(duplicateWarnings).toEqual([])
    emitWarning.mockRestore()
  })

  it('declares exactly one {userId,productId} composite and it is unique', () => {
    const composites = UserProduct.schema.indexes().filter(([keys]) => isEnrollmentKey(keys))

    expect(composites).toHaveLength(1)
    expect(composites[0][1]).toMatchObject({ unique: true })
  })

  it('keeps the related field-level and status indexes', () => {
    const indexes = UserProduct.schema.indexes()
    const some = (predicate: (keys: Record<string, unknown>) => boolean): boolean =>
      indexes.some(([keys]) => predicate(keys))

    // field-level single-field indexes for userId and productId
    expect(some((k) => Object.keys(k).length === 1 && k.userId === 1)).toBe(true)
    expect(some((k) => Object.keys(k).length === 1 && k.productId === 1)).toBe(true)
    // status composites
    expect(some((k) => Object.keys(k).length === 2 && k.userId === 1 && k.status === 1)).toBe(true)
    expect(some((k) => Object.keys(k).length === 2 && k.productId === 1 && k.status === 1)).toBe(true)
  })
})
