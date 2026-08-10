import { configuredCredentialGroup, parseBooleanFlag, parseBoundedInteger } from '../../src/config/appConfig'
import * as primitives from '../../src/config/configPrimitives'

describe('app config topology', () => {
  it('keeps primitive parsers in a dependency-light module and preserves exports', () => {
    expect(primitives.parseBooleanFlag).toBe(parseBooleanFlag)
    expect(primitives.parseBoundedInteger).toBe(parseBoundedInteger)
    expect(primitives.configuredCredentialGroup).toBe(configuredCredentialGroup)
  })
})
