// ════════════════════════════════════════════════════════════
// 📁 src/routes/events.routes.ts
// Rotas de Eventos — Público (alunos) + Admin (backoffice)
// ════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express'
import Event from '../models/Event'
import EventType from '../models/EventType'
import { eventsDeleteInput } from '../security/eventsDestructiveInput'
import { withValidatedInput } from '../security/validatedInput'

const router = Router()

// ═════════════════════════════════════════════════════════════
// PÚBLICO — Para alunos (Comunidade_login)
// ═════════════════════════════════════════════════════════════

// GET /api/events/upcoming — Próximos eventos publicados
router.get('/upcoming', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 6

    const events = await Event.find({
      status: { $in: ['published', 'live'] },
      scheduledAt: { $gte: new Date() },
      isPublic: true,
    })
      .sort({ scheduledAt: 1 })
      .limit(limit)
      .select('-interestedUsers')  // Não enviar lista de emails para o frontend
      .lean()
      .exec()

    res.json({ events })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao buscar eventos', details: error.message })
  }
})

// GET /api/events/:id — Detalhe de um evento
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const event = await Event.findById(req.params.id)
      .select('-interestedUsers')
      .lean()
      .exec()

    if (!event) {
      return res.status(404).json({ message: 'Evento não encontrado.' })
    }

    res.json({ event })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao buscar evento', details: error.message })
  }
})

// POST /api/events/:id/interest — Marcar/desmarcar interesse
router.post('/:id/interest', async (req: Request, res: Response) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ message: 'Email obrigatório.' })
    }

    const event = await Event.findById(req.params.id)
    if (!event) {
      return res.status(404).json({ message: 'Evento não encontrado.' })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const index = event.interestedUsers.indexOf(normalizedEmail)

    if (index === -1) {
      // Adicionar interesse
      event.interestedUsers.push(normalizedEmail)
      event.interestedCount = event.interestedUsers.length
    } else {
      // Remover interesse (toggle)
      event.interestedUsers.splice(index, 1)
      event.interestedCount = event.interestedUsers.length
    }

    await event.save()

    res.json({
      interested: index === -1,
      interestedCount: event.interestedCount,
    })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao marcar interesse', details: error.message })
  }
})

// ═════════════════════════════════════════════════════════════
// ADMIN — Para backoffice (Front)
// ═════════════════════════════════════════════════════════════

// GET /api/events — Listar todos (com filtros)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, eventType, from, to } = req.query
    const query: any = {}

    if (status) query.status = status
    if (eventType) query.eventType = eventType
    if (from || to) {
      query.scheduledAt = {}
      if (from) query.scheduledAt.$gte = new Date(from as string)
      if (to) query.scheduledAt.$lte = new Date(to as string)
    }

    const events = await Event.find(query)
      .sort({ scheduledAt: -1 })
      .lean()
      .exec()

    res.json({ events, total: events.length })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao listar eventos', details: error.message })
  }
})

// POST /api/events — Criar evento
router.post('/', async (req: Request, res: Response) => {
  try {
    const event = new Event(req.body)

    // Calcular endsAt se não fornecido
    if (!event.endsAt && event.scheduledAt && event.duration) {
      event.endsAt = new Date(event.scheduledAt.getTime() + event.duration * 60000)
    }

    await event.save()
    res.status(201).json({ event, message: 'Evento criado com sucesso.' })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao criar evento', details: error.message })
  }
})

// PUT /api/events/:id — Editar evento
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!event) {
      return res.status(404).json({ message: 'Evento não encontrado.' })
    }
    res.json({ event, message: 'Evento actualizado com sucesso.' })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao actualizar evento', details: error.message })
  }
})

// DELETE /api/events/:id — Apagar evento
router.delete('/:id', withValidatedInput(eventsDeleteInput, async (input, _req, res) => {
  try {
    const event = await Event.findByIdAndDelete(input.params.id)
    if (!event) {
      return res.status(404).json({ message: 'Evento não encontrado.' })
    }
    res.json({ message: 'Evento apagado com sucesso.' })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao apagar evento', details: error.message })
  }
}))

// PATCH /api/events/:id/status — Mudar estado
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status: newStatus } = req.body
    const valid = ['draft', 'published', 'live', 'completed', 'cancelled']
    if (!valid.includes(newStatus)) {
      return res.status(400).json({ message: `Estado inválido. Usar: ${valid.join(', ')}` })
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { status: newStatus },
      { new: true }
    )
    if (!event) {
      return res.status(404).json({ message: 'Evento não encontrado.' })
    }
    res.json({ event, message: `Estado alterado para ${newStatus}.` })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao alterar estado', details: error.message })
  }
})

// ═════════════════════════════════════════════════════════════
// EVENT TYPES — CRUD
// ═════════════════════════════════════════════════════════════

router.get('/types/list', async (_req: Request, res: Response) => {
  try {
    const types = await EventType.find({ isActive: true }).sort({ label: 1 }).lean().exec()
    res.json({ types })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao listar tipos', details: error.message })
  }
})

router.post('/types', async (req: Request, res: Response) => {
  try {
    const eventType = new EventType(req.body)
    await eventType.save()
    res.status(201).json({ eventType, message: 'Tipo criado com sucesso.' })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao criar tipo', details: error.message })
  }
})

router.put('/types/:id', async (req: Request, res: Response) => {
  try {
    const eventType = await EventType.findByIdAndUpdate(req.params.id, req.body, { new: true })
    if (!eventType) {
      return res.status(404).json({ message: 'Tipo não encontrado.' })
    }
    res.json({ eventType, message: 'Tipo actualizado com sucesso.' })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao actualizar tipo', details: error.message })
  }
})

// POST /api/events/seed — Seeding inicial de tipos + eventos demo
router.post('/seed', async (_req: Request, res: Response) => {
  try {
    // Seed tipos
    const types = [
      { code: 'boas_vindas', label: 'Live de Boas-Vindas', color: '#22c55e', icon: '👋', defaultDuration: 60, defaultPlatform: 'zoom' },
      { code: 'portfolio', label: 'Live de Portfólio', color: '#3b82f6', icon: '📊', defaultDuration: 90, defaultPlatform: 'zoom' },
      { code: 'live_mensal', label: 'Live Mensal', color: '#eab308', icon: '📅', defaultDuration: 60, defaultPlatform: 'zoom' },
      { code: 'mentoria', label: 'Live de Mentoria', color: '#a855f7', icon: '🎓', defaultDuration: 120, defaultPlatform: 'zoom' },
    ]

    let typesCreated = 0
    for (const t of types) {
      const exists = await EventType.findOne({ code: t.code })
      if (!exists) {
        await EventType.create(t)
        typesCreated++
      }
    }

    // Seed eventos de exemplo
    const now = new Date()
    const nextMonth = (day: number, hour: number) => {
      const d = new Date(now.getFullYear(), now.getMonth(), day, hour, 0, 0)
      if (d < now) d.setMonth(d.getMonth() + 1)
      return d
    }

    const events = [
      {
        title: 'Live Portfólio da Comunidade - Junho',
        description: 'Revisão mensal do portfólio da comunidade. Análise de desempenho, rebalanceamento e próximos investimentos.',
        eventType: 'portfolio',
        color: '#3b82f6',
        scheduledAt: nextMonth(1, 21),
        duration: 90,
        platform: 'zoom',
        links: [
          { name: 'Zoom', url: 'https://zoom.us/j/example-portfolio' },
        ],
        coverImage: '/assets/events/portfolio-cover.png',
        status: 'published',
        isPublic: true,
        interestedCount: 19,
      },
      {
        title: 'Live de Mentoria - Grupo A',
        description: 'Sessão de mentoria para o Grupo A. Dúvidas sobre investimentos, análise de carteiras individuais.',
        eventType: 'mentoria',
        color: '#a855f7',
        scheduledAt: nextMonth(5, 20),
        duration: 120,
        platform: 'zoom',
        links: [
          { name: 'Zoom', url: 'https://zoom.us/j/example-mentoria' },
        ],
        status: 'published',
        isPublic: true,
        interestedCount: 8,
      },
      {
        title: 'Live Mensal - Julho',
        description: 'Live mensal com temas de actualidade: mercados, ETFs, obrigações e estratégias.',
        eventType: 'live_mensal',
        color: '#eab308',
        scheduledAt: nextMonth(15, 21),
        duration: 60,
        platform: 'zoom',
        links: [
          { name: 'Zoom', url: 'https://zoom.us/j/example-mensal' },
        ],
        status: 'published',
        isPublic: true,
        interestedCount: 34,
      },
      {
        title: 'Boas-Vindas Turma 20',
        description: 'Sessão de boas-vindas para os novos alunos da Turma 20. Apresentação da plataforma e primeiros passos.',
        eventType: 'boas_vindas',
        color: '#22c55e',
        scheduledAt: nextMonth(20, 21),
        duration: 60,
        platform: 'zoom',
        links: [
          { name: 'Zoom', url: 'https://zoom.us/j/example-boas-vindas' },
        ],
        status: 'published',
        isPublic: true,
        interestedCount: 12,
      },
      {
        title: 'Live Portfólio da Comunidade - Julho',
        description: 'Revisão mensal do portfólio. Julho: análise pós-resultados Q2.',
        eventType: 'portfolio',
        color: '#3b82f6',
        scheduledAt: nextMonth(29, 21),
        duration: 90,
        platform: 'zoom',
        links: [
          { name: 'Zoom', url: 'https://zoom.us/j/example-portfolio-jul' },
        ],
        coverImage: '/assets/events/portfolio-cover.png',
        status: 'published',
        isPublic: true,
        interestedCount: 17,
      },
    ]

    let eventsCreated = 0
    for (const e of events) {
      const exists = await Event.findOne({ title: e.title, scheduledAt: e.scheduledAt })
      if (!exists) {
        await Event.create(e)
        eventsCreated++
      }
    }

    res.json({
      message: 'Seeding concluído.',
      typesCreated,
      eventsCreated,
    })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro no seeding', details: error.message })
  }
})

export default router
