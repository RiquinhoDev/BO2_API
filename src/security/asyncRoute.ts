import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { ParamsDictionary } from 'express-serve-static-core'
import type { ParsedQs } from 'qs'

export type AsyncRouteHandler<
  Params = ParamsDictionary,
  ResponseBody = unknown,
  RequestBody = unknown,
  RequestQuery = ParsedQs,
> = (
  req: Request<Params, ResponseBody, RequestBody, RequestQuery>,
  res: Response<ResponseBody>,
  next: NextFunction,
) => unknown | Promise<unknown>

export function asyncRoute<
  Params = ParamsDictionary,
  ResponseBody = unknown,
  RequestBody = unknown,
  RequestQuery = ParsedQs,
>(
  handler: AsyncRouteHandler<Params, ResponseBody, RequestBody, RequestQuery>,
): RequestHandler<Params, ResponseBody, RequestBody, RequestQuery> {
  return (req, res, next) => {
    try {
      Promise.resolve(handler(req, res, next)).catch(next)
    } catch (error) {
      next(error)
    }
  }
}