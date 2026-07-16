import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express'
import { z } from 'zod'
import { HttpError } from './errorHandling'

const OFFLINE_LOOPBACK_MARKER = '__bo2_offline_loopback'
const FORBIDDEN_PROPERTY_NAMES = new Set([
  '__proto__',
  'constructor',
  'prototype',
])

export type ValidatedRequest = Omit<Request, 'body' | 'params' | 'query'> & {
  readonly body: undefined
  readonly params: undefined
  readonly query: undefined
}

export type ValidatedInputHandler<TSchema extends z.AnyZodObject> = (
  input: z.infer<TSchema>,
  req: ValidatedRequest,
  res: Response,
  next: NextFunction,
) => unknown | Promise<unknown>

export function validatedSchema<
  TParams extends z.ZodRawShape,
  TQuery extends z.ZodRawShape,
  TBody extends z.ZodRawShape,
>(shapes: {
  params: TParams
  query: TQuery
  body: TBody
}) {
  return z.object({
    params: z.object(shapes.params).strict(),
    query: z.object(shapes.query).strict(),
    body: z.object(shapes.body).strict(),
  }).strict()
}

function withoutOfflineLoopbackMarker(query: unknown): unknown {
  if (
    process.env.NODE_ENV !== 'test'
    || query === null
    || typeof query !== 'object'
    || Array.isArray(query)
  ) {
    return query
  }

  const source = query as Record<string, unknown>
  const clean = Object.create(null) as Record<string, unknown>

  for (const property of Object.getOwnPropertyNames(source)) {
    if (property === OFFLINE_LOOPBACK_MARKER) continue
    Object.defineProperty(clean, property, {
      configurable: true,
      enumerable: true,
      value: source[property],
      writable: true,
    })
  }

  return clean
}

function unsafeProperty(property: string): boolean {
  return (
    property.startsWith('$')
    || property.includes('.')
    || FORBIDDEN_PROPERTY_NAMES.has(property)
  )
}

function assertNoUnsafeProperties(
  value: unknown,
  path = 'input',
  visited = new WeakSet<object>(),
): void {
  if (value === null || typeof value !== 'object' || visited.has(value)) return
  visited.add(value)

  for (const property of Object.getOwnPropertyNames(value)) {
    if (unsafeProperty(property)) {
      throw new Error(`unsafe input property at ${path}.${property}`)
    }
    assertNoUnsafeProperties(
      (value as Record<string, unknown>)[property],
      `${path}.${property}`,
      visited,
    )
  }
}

function invalidRequest(cause: unknown): HttpError {
  return new HttpError({
    status: 400,
    code: 'INVALID_REQUEST',
    publicMessage: 'Pedido inválido',
    cause,
  })
}

export function withValidatedInput<TSchema extends z.AnyZodObject>(
  schema: TSchema,
  handler: ValidatedInputHandler<TSchema>,
): RequestHandler {
  return (req, res, next) => {
    const input = {
      params: req.params,
      query: withoutOfflineLoopbackMarker(req.query),
      body: req.body ?? {},
    }

    let data: z.infer<TSchema>
    try {
      assertNoUnsafeProperties(input)
      const parsed = schema.safeParse(input)
      if (!parsed.success) throw parsed.error
      data = parsed.data
    } catch (error) {
      next(invalidRequest(error))
      return
    }

    void (async () => {
      await handler(data, req as ValidatedRequest, res, next)
    })().catch(next)
  }
}
