import { Request, Response } from 'express'
import RenewalOffer from '../models/RenewalOffer'
import { syncRenewalOffers } from '../services/renewal/renewalSync.service'
import { getTurmasWithCoverage } from '../services/renewal/renewalCoverage.service'
import { getRenewalPerformance } from '../services/renewal/renewalPerformance.service'
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

const CHECKOUT_BASE_URL = 'https://pay.hotmart.com/D61245882D'

// POST /api/renewal/offers
// Adiciona uma oferta à mão (códigos do dashboard Hotmart que não têm vendas
// recentes e por isso o sync não descobre). Guarda como source='manual'.
export async function createOffer(req: Request, res: Response): Promise<void> {
  try {
    const { offerCode, offerName, turmaNumbers, link, isActive } = req.body

    const code = typeof offerCode === 'string' ? offerCode.trim() : ''
    if (!code) {
      res.status(400).json({ message: 'offerCode é obrigatório' })
      return
    }

    const existing = await RenewalOffer.findOne({ offerCode: code }).exec()
    if (existing) {
      res.status(409).json({ message: `Já existe uma oferta com o código ${code}`, offer: existing })
      return
    }

    const name = typeof offerName === 'string' ? offerName.trim() : ''
    const parsed = parseOfferName(name)

    const offer = await RenewalOffer.create({
      offerCode: code,
      offerName: name,
      link: (typeof link === 'string' && link.trim())
        ? link.trim()
        : `${CHECKOUT_BASE_URL}?off=${encodeURIComponent(code)}&checkoutMode=10`,
      turmaNumbers: Array.isArray(turmaNumbers)
        ? turmaNumbers.map(Number).filter((n) => !Number.isNaN(n))
        : parsed.turmaNumbers,
      periodYYMM: parsed.periodYYMM,
      periodStart: parsed.periodStart,
      isRenewal: parsed.isRenewal || /renova/i.test(name),
      isActive: typeof isActive === 'boolean' ? isActive : true,
      source: 'manual',
      isManuallyEdited: true,
      priceValue: null,
      currency: null,
      paymentModes: [],
      salesCount: 0,
      suggestedTurmas: [],
      suggestionConfidence: 0,
      suggestionSampleSize: 0,
      lastSeenAt: new Date()
    })

    res.status(201).json({ offer })
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Erro ao criar oferta' })
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
    // alerta: só turmas que renovam ESTE ANO e ainda não têm oferta
    const uncovered = turmas.filter((t) => t.renewsThisYear && !t.hasActiveOffer)
    res.json({ turmas, uncovered })
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Erro ao listar turmas' })
  }
}

// GET /api/renewal/performance
// Taxa de renovação por turma (vendas / base) vs meta de 20%.
export async function performance(req: Request, res: Response): Promise<void> {
  try {
    const yearRaw = Number(req.query.year)
    const year = Number.isInteger(yearRaw) && yearRaw > 2000 ? yearRaw : undefined
    const data = await getRenewalPerformance(year)
    res.json(data)
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Erro ao calcular desempenho' })
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

export default { listOffers, createOffer, updateOffer, listTurmas, performance, runSync }
