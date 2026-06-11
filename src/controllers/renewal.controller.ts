import { Request, Response } from 'express'
import RenewalOffer from '../models/RenewalOffer'
import { syncRenewalOffers } from '../services/renewal/renewalSync.service'
import { getTurmasWithCoverage } from '../services/renewal/renewalCoverage.service'
import { parseOfferName } from '../services/renewal/turmaParser'

// GET /api/renewal/offers
// Lista todas as ofertas de renovação com os dados da Hotmart + turma sugerida.
export async function listOffers(req: Request, res: Response): Promise<void> {
  try {
    const { isActive, isRenewal } = req.query
    const query: Record<string, unknown> = {}
    if (isActive === 'true') query.isActive = true
    if (isActive === 'false') query.isActive = false
    if (isRenewal === 'true') query.isRenewal = true
    if (isRenewal === 'false') query.isRenewal = false

    const offers = await RenewalOffer.find(query)
      .sort({ isRenewal: -1, salesCount: -1, offerCode: 1 })
      .lean()
      .exec()

    res.json({ total: offers.length, offers })
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Erro ao listar ofertas' })
  }
}

// PATCH /api/renewal/offers/:id
// Edita a oferta no Backoffice (nome, turma(s), período, link, estado).
// Marca isManuallyEdited=true para o sync não sobrescrever.
export async function updateOffer(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { offerName, turmaNumbers, periodYYMM, isRenewal, isActive, link } = req.body

    const set: Record<string, unknown> = { isManuallyEdited: true }

    // Se vier nome e não vierem turma/período explícitos, deriva do nome.
    const parsed = typeof offerName === 'string' ? parseOfferName(offerName) : null

    if (typeof offerName === 'string') set.offerName = offerName.trim()
    if (Array.isArray(turmaNumbers)) {
      set.turmaNumbers = turmaNumbers.map(Number).filter((n) => !Number.isNaN(n))
    } else if (parsed) {
      set.turmaNumbers = parsed.turmaNumbers
    }
    if (typeof periodYYMM === 'string') {
      set.periodYYMM = periodYYMM.trim() || null
    } else if (parsed) {
      set.periodYYMM = parsed.periodYYMM
      set.periodStart = parsed.periodStart
    }
    if (typeof isRenewal === 'boolean') set.isRenewal = isRenewal
    else if (parsed) set.isRenewal = parsed.isRenewal
    if (typeof isActive === 'boolean') set.isActive = isActive
    if (typeof link === 'string' && link.trim()) set.link = link.trim()

    const offer = await RenewalOffer.findByIdAndUpdate(id, { $set: set }, { new: true })
    if (!offer) {
      res.status(404).json({ message: 'Oferta não encontrada' })
      return
    }

    res.json({ offer })
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Erro ao actualizar oferta' })
  }
}

// GET /api/renewal/turmas
// Lista de turmas (nº + nº de alunos) com flag de cobertura, para o multi-select
// do BO e o alerta de turmas sem oferta.
export async function listTurmas(_req: Request, res: Response): Promise<void> {
  try {
    const turmas = await getTurmasWithCoverage()
    const uncovered = turmas.filter((t) => t.studentCount > 0 && !t.hasActiveOffer)
    res.json({ turmas, uncovered })
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Erro ao listar turmas' })
  }
}

// POST /api/renewal/sync
// Dispara a sincronização das ofertas a partir da Hotmart.
export async function runSync(_req: Request, res: Response): Promise<void> {
  try {
    const report = await syncRenewalOffers()
    res.json({ report })
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Erro ao sincronizar ofertas' })
  }
}

export default { listOffers, updateOffer, listTurmas, runSync }
