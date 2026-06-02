// ════════════════════════════════════════════════════════════
// 📁 src/services/achievements/achievementDefinitions.ts
// Definição das 26 conquistas — fonte de verdade backend
// ════════════════════════════════════════════════════════════

export interface AchievementDefinition {
  id: string
  name: string
  description: string
  category: 'sequencia' | 'progresso' | 'envolvimento' | 'comunidade' | 'marcos'
  target?: number   // para badges com progresso (ex: 7 dias, 50%)
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // ── Sequência de Acesso (6) ──
  { id: 'primeiro_login',   name: 'Primeiro Login',     description: 'Fizeste o teu primeiro acesso à plataforma',           category: 'sequencia' },
  { id: 'streak_7_dias',    name: '7 Dias Seguidos',    description: 'Acedeste à plataforma 7 dias seguidos',               category: 'sequencia', target: 7 },
  { id: 'streak_30_dias',   name: '30 Dias Seguidos',   description: 'Acedeste à plataforma 30 dias seguidos',              category: 'sequencia', target: 30 },
  { id: 'streak_100_dias',  name: '100 Dias Seguidos',  description: 'Acedeste à plataforma 100 dias seguidos',             category: 'sequencia', target: 100 },
  { id: 'streak_365_dias',  name: '365 Dias Seguidos',  description: 'Um ano inteiro sem falhar um dia',                    category: 'sequencia', target: 365 },
  { id: 'fenix',            name: 'Fénix',              description: 'Reactivaste o teu acesso após inactivação',           category: 'sequencia' },

  // ── Progresso no Curso (7) ──
  { id: 'primeira_licao',     name: 'Primeira Lição',      description: 'Completaste a tua primeira lição',                 category: 'progresso' },
  { id: 'estudante_dedicado', name: 'Estudante Dedicado',  description: 'Completaste 10 lições',                            category: 'progresso', target: 10 },
  { id: 'meio_caminho',       name: 'Meio Caminho',        description: 'Atingiste 50% de progresso no curso',              category: 'progresso', target: 50 },
  { id: 'quase_la',           name: 'Quase Lá',            description: 'Atingiste 90% de progresso no curso',              category: 'progresso', target: 90 },
  { id: 'curso_completo',     name: 'Curso Completo',      description: 'Completaste o curso a 100%',                       category: 'progresso' },
  { id: 'mestre_modulo',      name: 'Mestre de Módulo',    description: 'Completaste um módulo inteiro',                    category: 'progresso' },
  { id: 'todos_modulos',      name: 'Todos os Módulos',    description: 'Completaste todos os módulos do curso',            category: 'progresso' },

  // ── Envolvimento (3) ──
  { id: 'activo',        name: 'Activo',        description: 'Atingiste nível de envolvimento Alto',                        category: 'envolvimento' },
  { id: 'super_activo',  name: 'Super Activo',  description: 'Atingiste nível de envolvimento Muito Alto',                  category: 'envolvimento' },
  { id: 'consistente',   name: 'Consistente',   description: 'Estiveste activo 4 semanas seguidas no último mês',           category: 'envolvimento' },

  // ── Turma e Comunidade (6) ──
  { id: 'riquinho',       name: 'Riquinho',          description: 'Entraste na comunidade Discord',                         category: 'comunidade' },
  { id: 'veterano',       name: 'Veterano',          description: 'Estás inscrito há mais de 6 meses',                      category: 'comunidade' },
  { id: 'pioneiro',       name: 'Pioneiro',          description: 'Pertences a uma das primeiras turmas',                   category: 'comunidade' },
  { id: 'renovador',      name: 'Renovador',         description: 'Renovaste o teu acesso ao curso',                        category: 'comunidade' },
  { id: 'multi_produto',  name: 'Multi-Produto',     description: 'Estás inscrito em 2 ou mais produtos',                   category: 'comunidade' },
  { id: 'mudanca_turma',  name: 'Mudança de Turma',  description: 'Mudaste de turma pelo menos uma vez',                    category: 'comunidade' },

  // ── Marcos Especiais (4) ──
  { id: 'madrugador',       name: 'Madrugador',         description: 'Acedeste nas primeiras 24 horas após a compra',       category: 'marcos' },
  { id: 'volta_triunfal',   name: 'Volta Triunfal',     description: 'Voltaste após mais de 30 dias sem aceder',            category: 'marcos' },
  { id: 'perfil_completo',  name: 'Perfil Completo',    description: 'Tens o perfil completamente preenchido',               category: 'marcos' },
  { id: 'um_ano',           name: '1 Ano de Riquinho',  description: 'Celebraste 1 ano na plataforma',                      category: 'marcos' },
]

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_DEFINITIONS.length  // 26
