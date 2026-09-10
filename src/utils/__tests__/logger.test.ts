import { test } from 'node:test'
import assert from 'node:assert/strict'
import winston from 'winston'
import Transport from 'winston-transport'
import { createStructuredLogger, consoleFormat } from '../logger'

// O CursEducaSync falhou 18 vezes em 252 com esta mensagem:
//
//   Converting circular structure to JSON
//       --> starting at object with constructor 'Object'
//       |     property 'res' -> object with constructor 'Object'
//       --- property 'req' closes the circle
//
// Não é um erro do sync. É um erro DO LOGGER. Quando a API da CursEduca
// devolve um erro, alguém regista-o, o erro do axios traz um `req`/`res`
// circular, e o `JSON.stringify` do formato de consola rebenta — de forma
// síncrona, dentro da chamada ao log. A excepção sobe e mata quem estava a
// escrever, substituindo o erro verdadeiro pelo do logger.
//
// Um logger que consegue derrubar quem o chama é pior do que um log perdido.

/** Um erro do axios, com o ciclo que a mensagem de erro descreve. */
function erroCircular(): Record<string, unknown> {
  const req: Record<string, unknown> = { path: '/members', method: 'GET' }
  const res: Record<string, unknown> = { status: 502, req }
  req.res = res
  // Sem `message`: o winston usa o `message` dos metadados como mensagem do
  // registo, e isso tapava o que queremos observar aqui — a circularidade.
  return { motivo: 'Bad Gateway', res }
}

/** Guarda o que o transporte recebeu, para se poder ver o que saiu. */
class Espia extends Transport {
  readonly linhas: string[] = []
  log(info: winston.Logform.TransformableInfo, next: () => void): void {
    this.linhas.push(String((info as unknown as { message: unknown }).message))
    next()
  }
}

function comConsola(): winston.Logger {
  // O formato VERDADEIRO da consola, importado. Copiá-lo para aqui tornava o
  // teste inútil: passaria com a cópia corrigida e o produto continuava mau.
  return createStructuredLogger({
    transports: [new winston.transports.Console({ format: consoleFormat })],
  })
}

// ── O que não pode voltar a acontecer ────────────────────────────────

test('registar um erro circular nao rebenta o logger', () => {
  const espia = new Espia()
  const logger = createStructuredLogger({ transports: [espia] })

  assert.doesNotThrow(
    () => logger.error('CursEduca falhou', erroCircular()),
    'um erro de rede nao pode derrubar quem o regista',
  )
})

test('a mensagem sobrevive mesmo quando os metadados nao serializam', () => {
  const espia = new Espia()
  const logger = createStructuredLogger({ transports: [espia] })

  logger.error('CursEduca falhou', erroCircular())

  assert.deepEqual(espia.linhas, ['CursEduca falhou'])
})

test('o formato da consola aguenta o ciclo', () => {
  // É este o formato que rebentava: feito à mão, com JSON.stringify cru.
  // O de ficheiro usa winston.format.json(), que já lida com ciclos.
  const logger = comConsola()

  assert.doesNotThrow(() => logger.error('CursEduca falhou', erroCircular()))
})

// ── O que tem de continuar a funcionar ───────────────────────────────

test('metadados normais continuam a ser registados', () => {
  const espia = new Espia()
  const logger = createStructuredLogger({ transports: [espia] })

  logger.info('sync completo', { total: 882, errors: 0 })

  assert.deepEqual(espia.linhas, ['sync completo'])
})

test('um Error normal continua a passar', () => {
  const espia = new Espia()
  const logger = createStructuredLogger({ transports: [espia] })

  assert.doesNotThrow(() => logger.error('falhou', new Error('sem rede')))
  assert.equal(espia.linhas.length, 1)
})
