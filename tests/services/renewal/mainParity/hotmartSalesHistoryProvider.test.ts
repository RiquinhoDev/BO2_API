import { extractSalesPageItems } from '../../../../src/services/renewal/hotmartSalesHistory.provider'

test('resposta Hotmart malformada falha fechado', () => {
  expect(() => extractSalesPageItems({ unexpected: true }, 100))
    .toThrow('HOTMART_SALES_INVALID_RESPONSE')
})

test('resposta Hotmart maior que o pedido falha fechado', () => {
  expect(() => extractSalesPageItems({ items: [{}, {}] }, 1))
    .toThrow('HOTMART_SALES_PAGE_EXCEEDS_REQUESTED_LIMIT')
})
