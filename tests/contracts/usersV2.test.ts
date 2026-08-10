import { ensureUsersV2Products } from '../../src/contracts/usersV2'

test('resultados do repositório garantem products como array', async () => {
  const repository = {
    list: jest.fn().mockResolvedValue([
      {
        _id: 'user-without-products',
        name: 'Sem produtos',
        email: 'sem-produtos@example.test',
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
      {
        _id: 'user-null-products',
        name: 'Produtos null',
        email: 'produtos-null@example.test',
        products: null,
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
      {
        _id: 'user-with-product',
        name: 'Com produto',
        email: 'com-produto@example.test',
        products: [{ _id: 'user-product-1', status: 'ACTIVE' }],
        createdAt: '2026-07-15T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
    ]),
  }

  const result = ensureUsersV2Products(await repository.list())

  expect(result.map((user) => user.products)).toEqual([
    [],
    [],
    [{ _id: 'user-product-1', status: 'ACTIVE' }],
  ])
  expect(result.every((user) => Array.isArray(user.products))).toBe(true)
})
