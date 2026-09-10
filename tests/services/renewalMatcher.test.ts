import assert from 'node:assert/strict'
import StudentClassHistory from '../../src/models/StudentClassHistory'
import RenewalOffer from '../../src/models/RenewalOffer'
import { findRenewalOffer } from '../../src/services/renewal/renewalMatcher.service'
import {
  GENERIC_RENEWAL_OFFER_CODE,
  TURMA_1_RENEWAL_OFFER_CODE,
  TURMA_2_RENEWAL_OFFER_CODE,
} from '../../src/services/renewal/renewalConstants'

const query = <T>(value: T) => ({
  select: () => ({ lean: () => ({ exec: async () => value }) }),
  exec: async () => value,
})

function withMocks(
  mocks: { classHistory?: Array<{ className?: string }>; offer?: (code: string) => unknown },
  run: () => Promise<void>,
) {
  const orig = {
    classFind: (StudentClassHistory as any).find,
    offerFindOne: (RenewalOffer as any).findOne,
  }
  ;(StudentClassHistory as any).find = () => query(mocks.classHistory ?? [])
  ;(RenewalOffer as any).findOne = (filter: { offerCode: string }) =>
    query(mocks.offer ? mocks.offer(filter.offerCode) : { offerCode: filter.offerCode, isActive: true })
  return run().finally(() => {
    ;(StudentClassHistory as any).find = orig.classFind
    ;(RenewalOffer as any).findOne = orig.offerFindOne
  })
}

test('turma actual "Turma 1 [4a renov] | 2601" → oferta Turma 1', async () => {
  await withMocks({}, async () => {
    const offer = await findRenewalOffer('Turma 1 [4a renov] | 2601', 'aluno-1')
    assert.equal((offer as any).offerCode, TURMA_1_RENEWAL_OFFER_CODE)
  })
})

test('turma actual "Turma 2 | 2204" (base) → oferta Turma 2', async () => {
  await withMocks({}, async () => {
    const offer = await findRenewalOffer('Turma 2 | 2204', 'aluno-1')
    assert.equal((offer as any).offerCode, TURMA_2_RENEWAL_OFFER_CODE)
  })
})

test('no limbo entre ciclos ("Turma Renovação | 2701") mas histórico tem "Turma 2 [4a renov]" → oferta Turma 2', async () => {
  await withMocks(
    { classHistory: [{ className: 'Turma 2 [3a renov] | 2506' }, { className: 'Turma 2 [4a renov] | 2606' }] },
    async () => {
      const offer = await findRenewalOffer('Turma Renovação | 2701', 'aluno-1')
      assert.equal((offer as any).offerCode, TURMA_2_RENEWAL_OFFER_CODE)
    },
  )
})

test('sem turma actual mas histórico tem "Turma 1 | 2112" → oferta Turma 1', async () => {
  await withMocks({ classHistory: [{ className: 'Turma 1 | 2112' }] }, async () => {
    const offer = await findRenewalOffer(null, 'aluno-1')
    assert.equal((offer as any).offerCode, TURMA_1_RENEWAL_OFFER_CODE)
  })
})

for (const name of [
  'Turmas 1 a 5 [renov] + REITs | 2407',
  'Turmas 1, 2 e 3 [2a renov] + REITs | 2501',
  'Turma 11 [renov] + REITs | 2509',
  'Turma Renovação | 2607',
]) {
  test(`"${name}" na turma actual E no histórico → genérica`, async () => {
    await withMocks(
      { classHistory: [{ className: name }], offer: (c) => (c === GENERIC_RENEWAL_OFFER_CODE ? { offerCode: c, isActive: true } : null) },
      async () => {
        const offer = await findRenewalOffer(name, 'aluno-1')
        assert.equal((offer as any).offerCode, GENERIC_RENEWAL_OFFER_CODE)
      },
    )
  })
}

test('sem turma actual, sem histórico, sem userId → genérica', async () => {
  await withMocks(
    { offer: (c) => (c === GENERIC_RENEWAL_OFFER_CODE ? { offerCode: c, isActive: true } : null) },
    async () => {
      const offer = await findRenewalOffer(null)
      assert.equal((offer as any).offerCode, GENERIC_RENEWAL_OFFER_CODE)
    },
  )
})

test('oferta fixa inativa/ausente na BD → cai na genérica', async () => {
  await withMocks(
    {
      classHistory: [{ className: 'Turma 1 | 2112' }],
      offer: (c) => (c === GENERIC_RENEWAL_OFFER_CODE ? { offerCode: c, isActive: true } : null),
    },
    async () => {
      const offer = await findRenewalOffer('Turma Renovação Genérica', 'aluno-1')
      assert.equal((offer as any).offerCode, GENERIC_RENEWAL_OFFER_CODE)
    },
  )
})
