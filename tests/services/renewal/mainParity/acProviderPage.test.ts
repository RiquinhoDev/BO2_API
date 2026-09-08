import { readProviderArray } from '../../../../src/services/renewal/acProviderPage'

test('AC malformada não vira página vazia', () => {
  expect(() => readProviderArray({}, 'tags', 100, 'AC_TAGS'))
    .toThrow('AC_TAGS_INVALID_RESPONSE')
})

test('AC não pode devolver mais linhas que o pedido', () => {
  expect(() => readProviderArray({ contacts: [{}, {}] }, 'contacts', 1, 'AC_CONTACTS'))
    .toThrow('AC_CONTACTS_PAGE_EXCEEDS_REQUESTED_LIMIT')
})
