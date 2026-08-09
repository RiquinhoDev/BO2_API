import Product from '../../src/models/product/Product'

// Regression net for the duplicated guru indexes: guruProductId / guruOfferId
// were declared both field-level ({ sparse: true, index: true }) and again via
// ProductSchema.index({ field: 1 }) (non-sparse). The canonical declaration is
// the sparse field-level one. No Mongo needed — schema-only.

describe('Product guru indexes', () => {
  it('imports the model without emitting a duplicate-index warning for the guru fields', () => {
    const emitWarning = jest.spyOn(process, 'emitWarning')
    // Re-compile the schema in isolation so the duplicate-index check runs again
    // (the top-level import already registered the model on the shared mongoose).
    jest.isolateModules(() => {
      require('../../src/models/product/Product')
    })

    const guruDuplicateWarnings = emitWarning.mock.calls
      .map((args) => String(args[0]))
      .filter((message) => message.includes('Duplicate schema index') && /guru/i.test(message))

    expect(guruDuplicateWarnings).toEqual([])
    emitWarning.mockRestore()
  })

  it('declares exactly one sparse index for each guru field', () => {
    const indexes = Product.schema.indexes()
    const forField = (field: string) =>
      indexes.filter((entry) => Object.prototype.hasOwnProperty.call(entry[0], field))

    const productIndexes = forField('guruProductId')
    const offerIndexes = forField('guruOfferId')

    // Exactly one effective index per field...
    expect(productIndexes).toHaveLength(1)
    expect(offerIndexes).toHaveLength(1)

    // ...and each preserves sparse: true (no non-sparse declaration remains).
    expect(productIndexes[0][0]).toEqual({ guruProductId: 1 })
    expect(offerIndexes[0][0]).toEqual({ guruOfferId: 1 })
    expect(productIndexes[0][1]).toMatchObject({ sparse: true })
    expect(offerIndexes[0][1]).toMatchObject({ sparse: true })
  })
})
