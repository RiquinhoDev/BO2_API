import * as publicController from '../../src/controllers/testimonials.controller'
import * as commands from '../../src/controllers/testimonials/testimonialCommands.controller'
import * as queries from '../../src/controllers/testimonials/testimonialQueries.controller'
import * as candidates from '../../src/controllers/testimonials/testimonialCandidates.controller'

test('testimonial public handlers are owned by focused controllers', () => {
  expect(publicController.createTestimonial).toBe(commands.createTestimonial)
  expect(publicController.updateTestimonialStatus).toBe(commands.updateTestimonialStatus)
  expect(publicController.getTestimonialStats).toBe(queries.getTestimonialStats)
  expect(publicController.getStudentTestimonials).toBe(queries.getStudentTestimonials)
  expect(publicController.getAvailableStudents).toBe(candidates.getAvailableStudents)
  expect(publicController.getBestCandidates).toBe(candidates.getBestCandidates)
})
