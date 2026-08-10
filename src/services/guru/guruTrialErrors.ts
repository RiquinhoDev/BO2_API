export class TrialUserNotFoundError extends Error {
  constructor() {
    super('Utilizador não encontrado')
    this.name = 'TrialUserNotFoundError'
  }
}

export class TrialNotEndedError extends Error {
  constructor() {
    super('Trial ainda não terminou')
    this.name = 'TrialNotEndedError'
  }
}