import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import { z } from 'zod'
import {
  type ValidatedInputHandler,
  type ValidatedInputSchema,
  validatedSchema,
} from '../../src/security/validatedInput'

installTestRuntimeConfigHooks()

type Assert<T extends true> = T
type AssertFalse<T extends false> = T
type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
    (<T>() => T extends TRight ? 1 : 2)
    ? (<T>() => T extends TRight ? 1 : 2) extends
      (<T>() => T extends TLeft ? 1 : 2)
      ? true
      : false
    : false

const approved = validatedSchema({
  params: { id: z.string() },
  query: { page: z.string() },
  body: { name: z.string() },
})
const refined = approved.superRefine(() => undefined)
const scalarTransform = approved.transform(() => 'invalid')
const unbrandedPermissive = z.object({
  params: z.object({ id: z.string() }),
  query: z.object({ page: z.string() }),
  body: z.object({ name: z.string() }),
})
const unbrandedStrict = z.object({
  params: z.object({ id: z.string() }).strict(),
  query: z.object({ page: z.string() }).strict(),
  body: z.object({ name: z.string() }).strict(),
}).strict()
const unbrandedRefined = unbrandedStrict.superRefine(() => undefined)

type ApprovedSchema = Assert<
  typeof approved extends ValidatedInputSchema ? true : false
>
type ApprovedRefinement = Assert<
  typeof refined extends ValidatedInputSchema ? true : false
>
type RejectAny = AssertFalse<
  z.ZodAny extends ValidatedInputSchema ? true : false
>
type RejectUnknown = AssertFalse<
  z.ZodUnknown extends ValidatedInputSchema ? true : false
>
type RejectScalar = AssertFalse<
  z.ZodString extends ValidatedInputSchema ? true : false
>
type RejectScalarTransform = AssertFalse<
  typeof scalarTransform extends ValidatedInputSchema ? true : false
>
type RejectPermissiveObject = AssertFalse<
  typeof unbrandedPermissive extends ValidatedInputSchema ? true : false
>
type RejectUnbrandedObject = AssertFalse<
  typeof unbrandedStrict extends ValidatedInputSchema ? true : false
>
type RejectUnbrandedRefinement = AssertFalse<
  typeof unbrandedRefined extends ValidatedInputSchema ? true : false
>
type InferredInput = Parameters<ValidatedInputHandler<typeof refined>>[0]
type ExactDto = Assert<Equal<InferredInput, {
  params: { id: string }
  query: { page: string }
  body: { name: string }
}>>

const compileTimeAssertions: [
  ApprovedSchema,
  ApprovedRefinement,
  RejectAny,
  RejectUnknown,
  RejectScalar,
  RejectScalarTransform,
  RejectPermissiveObject,
  RejectUnbrandedObject,
  RejectUnbrandedRefinement,
  ExactDto,
] = [true, true, false, false, false, false, false, false, false, true]

test('accepts only builder schemas while preserving the exact DTO', () => {
  expect(compileTimeAssertions).toEqual([
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    true,
  ])
})
