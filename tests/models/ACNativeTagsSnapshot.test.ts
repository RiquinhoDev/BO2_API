import ACNativeTagsSnapshot from '../../src/models/acTags/ACNativeTagsSnapshot'

test('enforces one native-tag snapshot per normalized email', () => {
  const indexes = ACNativeTagsSnapshot.schema.indexes()

  expect(indexes).toContainEqual([
    { email: 1 },
    { background: true, unique: true },
  ])
  expect(indexes).toContainEqual([
    { email: 1, lastSyncAt: -1 },
    { background: true },
  ])
})
