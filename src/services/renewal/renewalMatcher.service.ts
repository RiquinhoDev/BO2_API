import mongoose from 'mongoose'
import StudentClassHistory from '../../models/StudentClassHistory'
import RenewalOffer, { IRenewalOffer } from '../../models/RenewalOffer'
import {
  GENERIC_RENEWAL_OFFER_CODE,
  TURMA_1_RENEWAL_OFFER_CODE,
  TURMA_2_RENEWAL_OFFER_CODE
} from './renewalConstants'

// A Turma 1 e a Turma 2 têm oferta de renovação própria (preço fixo). Ser
// "da Turma 1/2" é permanente — não muda quando o aluno passa por um balde
// genérico entre ciclos ("Turma Renovação | AAMM") ou fica sem turma à espera
// de ser movido para a "[5a renov]". Por isso o link decide-se assim:
//
//   1. A turma ACTUAL é "Turma 1 ..." / "Turma 2 ..." (singular)  -> oferta fixa
//   2. Senão, o aluno JÁ ESTEVE alguma vez numa "Turma 1 ..." /
//      "Turma 2 ..." (histórico de turmas)                        -> oferta fixa
//   3. Senão                                                      -> genérica
//
// SÓ o singular conta. Ficam de fora (→ genérica): "Turmas 1 a 5" /
// "Turmas 1, 2 e 3" (fundidas), "Turma 11 ..." (o \s*[|[] logo a seguir ao
// 1/2 garante isso) e "Turma Renovação | AAMM".
const SOLO_TURMA_1 = /^\s*turma\s+0*1\s*[|[]/i
const SOLO_TURMA_2 = /^\s*turma\s+0*2\s*[|[]/i

function soloTurmaOfferCode(className: string): string | null {
  if (SOLO_TURMA_1.test(className)) return TURMA_1_RENEWAL_OFFER_CODE
  if (SOLO_TURMA_2.test(className)) return TURMA_2_RENEWAL_OFFER_CODE
  return null
}

async function resolveFixedTurmaOfferCode(
  activeClassName: string | null | undefined,
  userId: mongoose.Types.ObjectId | string | null | undefined
): Promise<string | null> {
  // 1. turma actual
  const fromActive = soloTurmaOfferCode(activeClassName || '')
  if (fromActive) return fromActive

  // 2. histórico de turmas (identidade permanente da turma 1/2)
  if (!userId) return null

  const classHistory = await StudentClassHistory.find({ studentId: userId })
    .select('className')
    .lean()
    .exec() as Array<{ className?: string }>

  for (const h of classHistory) {
    const code = soloTurmaOfferCode(h.className || '')
    if (code) return code
  }

  return null
}

export async function findRenewalOffer(
  activeClassName?: string | null,
  userId?: mongoose.Types.ObjectId | string | null
): Promise<IRenewalOffer | null> {
  const fixedCode = await resolveFixedTurmaOfferCode(activeClassName, userId)

  if (fixedCode) {
    const fixed = await RenewalOffer.findOne({ offerCode: fixedCode, isActive: true }).exec()
    if (fixed) return fixed
    // oferta fixa não encontrada/inativa na BD — cai para a genérica em vez de nada
  }

  return RenewalOffer.findOne({
    offerCode: GENERIC_RENEWAL_OFFER_CODE,
    isActive: true
  }).exec()
}

export default findRenewalOffer
