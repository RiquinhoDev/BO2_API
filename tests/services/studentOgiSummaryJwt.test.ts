import jwt from 'jsonwebtoken'
import { configureJwt, signAppToken } from '../../src/security/jwt'
import { resolveStudentEmailFromToken } from '../../src/services/studentOgiSummary.service'

const APP_SECRET = 'test-only-student-summary-app-secret-at-least-32-characters'
const OLD_API_SECRET = 'test-only-student-summary-old-secret-at-least-32-characters'
const STUDENT_ACCESS_SECRET = 'test-only-student-summary-student-secret-at-least-32-characters'

beforeEach(() =>
  configureJwt({
    jwtSecret: APP_SECRET,
    oldApiJwtSecret: OLD_API_SECRET,
    studentAccessJwtSecret: STUDENT_ACCESS_SECRET,
  }),
)

test('resolveStudentEmailFromToken aceita apenas token assinado com chave de estudante', () => {
  const studentToken = jwt.sign({ email: ' Student@Example.Test ' }, STUDENT_ACCESS_SECRET)
  const appToken = signAppToken({ email: 'student@example.test' })

  expect(resolveStudentEmailFromToken(studentToken)).toBe('student@example.test')
  expect(() => resolveStudentEmailFromToken(appToken)).toThrow()
})
