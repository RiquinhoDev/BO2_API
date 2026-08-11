import fixture from '../fixtures/clareza/comparador-main-contract.json'

describe('Clareza comparator HTTP contract (Task 5 adapter)', () => {
  it('pins the Task 5 public error documents from origin/main without adding a route early', () => {
    expect(fixture.http).toEqual({
      get: {
        missingQuery: { error: 'Indica ?symbols=AAPL,MSFT para comparar ou ?search=apple para pesquisar.' },
        unavailable: { error: 'Dados indisponíveis. Tente novamente em breve.' },
      },
      refresh: {
        unauthorized: { error: 'Refresh Clareza nao autorizado' },
      },
    })
  })
})
