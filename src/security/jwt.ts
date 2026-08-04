import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken'

export interface JwtConfiguration {
  jwtSecret: string
  oldApiJwtSecret: string
  studentAccessJwtSecret: string
}

let activeConfiguration: Readonly<JwtConfiguration> | undefined

export function configureJwt(configuration: JwtConfiguration): void {
  activeConfiguration = Object.freeze({
    jwtSecret: configuration.jwtSecret,
    oldApiJwtSecret: configuration.oldApiJwtSecret,
    studentAccessJwtSecret: configuration.studentAccessJwtSecret,
  })
}

function getConfiguration(): Readonly<JwtConfiguration> {
  if (!activeConfiguration) throw new Error('JWT nao configurado: bootstrap incompleto')
  return activeConfiguration
}

export function signAppToken(payload: object, options?: SignOptions): string {
  return jwt.sign(payload, getConfiguration().jwtSecret, options)
}

export function verifyAppToken<T extends JwtPayload = JwtPayload>(token: string): T {
  return jwt.verify(token, getConfiguration().jwtSecret) as T
}

export function verifyStudentAccessToken<T extends JwtPayload = JwtPayload>(token: string): T {
  return jwt.verify(token, getConfiguration().studentAccessJwtSecret) as T
}

export function signOldApiToken(payload: object, options?: SignOptions): string {
  const configuration = getConfiguration()
  return jwt.sign(payload, configuration.oldApiJwtSecret, options)
}
