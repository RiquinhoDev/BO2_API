import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')

test('final safe Partition A success paths use the canonical envelope', () => {
  const sources = [
    'src/controllers/tagMonitoring/criticalTag.controller.ts',
    'src/controllers/acTags/tagRule.controller.ts',
    'src/controllers/testimonials/testimonialCommands.controller.ts',
    'src/controllers/acTags/acReader.controller.ts',
    'src/controllers/acTags/activeCampaignProductTags.controller.ts',
    'src/controllers/classes/classRoster.controller.ts',
    'src/controllers/renewal.controller.ts',
    'src/routes/events.routes.ts',
    'src/controllers/courseLessons.controller.ts',
  ].map(read).join('\n')

  for (const expected of [
    "successResponse(null, { message: 'Tag crítica deletada permanentemente' })",
    'successResponse(rules, { count: rules.length })',
    "successResponse(null, { message: 'Regra desativada com sucesso' })",
    "successResponse(null, { message: 'Teste de regra (em desenvolvimento)' })",
    "successResponse({ testimonial }, { message: 'Testemunho criado com sucesso' })",
    'successResponse({ results }, {',
    "successResponse({ testimonial }, { message: 'Testemunho atualizado com sucesso' })",
    'deletedTestimonial: {',
    'successResponse(cached, { fromCache: true })',
    'successResponse(saved ?? payload, { fromCache: false })',
    'successResponse(stats, {',
    'successResponse({ students: result.students },',
    'successResponse({ offer })',
    'successResponse({ interested:',
    "successResponse({ lesson }, { message: 'Link da aula guardado com sucesso.' })",
  ]) expect(sources).toContain(expected)
})
