import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const ROOT = process.cwd()
const ROUTE_CATALOG_PATH = process.env.RESPONSE_CONTRACT_ROUTE_CATALOG ?? path.join(ROOT, 'src', 'security', 'route-catalog.json')
const RESPONSE_CATALOG_PATH = process.env.RESPONSE_CONTRACT_CATALOG ?? path.join(ROOT, 'src', 'contracts', 'response-contract-catalog.json')
const RESPONSE_MIGRATION_INVENTORY_PATH = process.env.RESPONSE_CONTRACT_MIGRATION_INVENTORY ?? path.join(ROOT, 'src', 'contracts', 'response-migration-inventory.json')
const FRONT_ROOT = process.env.RESPONSE_CONTRACT_FRONT_ROOT ?? path.resolve(ROOT, '..', 'Front')
const FRONT_EXTRA_SOURCE = process.env.RESPONSE_CONTRACT_FRONT_EXTRA_SOURCE
const LEGACY_SOURCE_OVERLAY_ROOT = process.env.RESPONSE_CONTRACT_SOURCE_OVERLAY
const TEST_SOURCE_OVERLAY_ROOT = process.env.RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY
const ALLOW_TEST_SOURCE_OVERLAY = process.env.RESPONSE_CONTRACT_ALLOW_TEST_OVERLAY
const TERMINAL_FAMILIES = new Set(['success-data', 'public-document', 'webhook-ack', 'redirect', 'stream-or-file', 'no-content'])
const CURRENT_FAMILIES = new Set([...TERMINAL_FAMILIES, 'domain-envelope', 'raw-json', '501-only'])
const PUBLIC_DOCUMENT_IDENTITIES = new Set([
  'GET /api/clareza/carteira-search',
  'GET /api/clareza/carteira/search',
  'GET /api/clareza/carteira/data',
  'GET /api/clareza/carteira/analysis',
  'GET /api/clareza/carteira/legacy-data',
  'GET /api/clareza/comparador',
  'GET /api/clareza/data',
  'GET /api/clareza/earnings/data',
  'GET /api/clareza/raiox',
  'GET /api/clareza/raiox-diagnose',
  'GET /api/clareza/raiox-search',
  'GET /api/clareza/raiox/:ticker',
  'GET /api/clareza/radar',
  'GET /api/clareza/reit-valuation/:ticker',
  'GET /api/clareza/reit/:ticker',
  'GET /api/clareza/stock/:ticker',
  'GET /api/clareza/top10',
  'GET /api/health',
  'GET /api/info',
])
const CANONICAL_ADMIN_IDENTITIES = new Set([
  'POST /api/clareza/operations',
  'POST /api/guru/webhooks/:id/reprocess',
])
const WEBHOOK_ACK_IDENTITIES = new Set([
  'POST /api/guru/webhook',
  'POST /api/webhooks/ac/email-opened',
  'POST /api/webhooks/ac/link-clicked',
])
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete'])
const TERMINAL_METHODS = new Set(['json', 'send', 'sendStatus', 'redirect', 'download', 'sendFile', 'writeHead', 'write', 'end'])

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'))
const identity = (entry) => `${entry.method} ${entry.path}`
const compareIdentities = (left, right) => identity(left).localeCompare(identity(right), 'en')
const slash = (filePath) => filePath.split(path.sep).join('/')
const sourcePath = (sourceFile) => slash(path.relative(ROOT, sourceFile.fileName))
const sourceLine = (sourceFile, node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1

function routeEvidence(route) {
  const match = route.evidence.match(/rota em (src\/.+\.ts):(\d+)$/)
  if (!match) throw new Error(`${identity(route)} has invalid route evidence`)
  return { file: match[1], line: Number(match[2]) }
}

const sourceFileKey = (filePath) => {
  const absolute = path.resolve(filePath)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

const containedPath = (parent, candidate) => {
  const relative = path.relative(parent, candidate)
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
}

function overlayEntries(directory, rootRealPath, entries = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    const relative = slash(path.relative(rootRealPath, absolute))
    const stats = fs.lstatSync(absolute)
    if (stats.isSymbolicLink()) {
      throw new Error(`${relative}: symbolic links are forbidden`)
    }
    const realPath = fs.realpathSync(absolute)
    if (!containedPath(rootRealPath, realPath)) {
      throw new Error(`${relative}: realpath escapes the overlay root`)
    }
    if (stats.isDirectory()) {
      overlayEntries(absolute, rootRealPath, entries)
      continue
    }
    if (!stats.isFile()) throw new Error(`${relative}: only regular files are allowed`)
    if (!/\.tsx?$/.test(entry.name)) {
      throw new Error(`${relative}: only .ts/.tsx files are allowed`)
    }
    entries.push({ fixturePath: realPath, relative })
  }
  return entries
}

function validatedSourceOverlays(overlayRoot) {
  if (overlayRoot.split(/[\\/]+/).includes('..')) {
    throw new Error('RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: traversal segments are forbidden')
  }
  if (!fs.existsSync(overlayRoot)) {
    throw new Error(`RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: root does not exist: ${overlayRoot}`)
  }
  const rootStats = fs.lstatSync(overlayRoot)
  if (rootStats.isSymbolicLink()) {
    throw new Error('RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: root cannot be a symbolic link')
  }
  if (!rootStats.isDirectory()) {
    throw new Error('RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: root must be a directory')
  }
  const rootRealPath = fs.realpathSync(overlayRoot)
  const tempRealPath = fs.realpathSync(os.tmpdir())
  if (!containedPath(tempRealPath, rootRealPath)) {
    throw new Error('RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: root must be contained in the OS temp directory')
  }
  const targetRoots = new Map([
    ['backend', fs.realpathSync(ROOT)],
    ['front', fs.realpathSync(FRONT_ROOT)],
  ])
  return new Map(overlayEntries(rootRealPath, rootRealPath).map(({ fixturePath, relative }) => {
    const segments = relative.split('/')
    const targetName = segments.shift()
    const targetRoot = targetRoots.get(targetName)
    if (!targetRoot) {
      throw new Error(`${relative}: target root must be backend or front`)
    }
    const relativeTarget = segments.join(path.sep)
    const virtualPath = path.resolve(targetRoot, relativeTarget)
    if (!containedPath(targetRoot, virtualPath)) {
      throw new Error(`${relative}: target escapes the ${targetName} source root`)
    }
    if (!fs.existsSync(virtualPath)) {
      throw new Error(`${relative}: target source does not exist`)
    }
    const targetRealPath = fs.realpathSync(virtualPath)
    if (!containedPath(targetRoot, targetRealPath)) {
      throw new Error(`${relative}: target realpath escapes the ${targetName} source root`)
    }
    if (!fs.lstatSync(targetRealPath).isFile() || !/\.tsx?$/.test(targetRealPath)) {
      throw new Error(`${relative}: target must be an existing .ts/.tsx source file`)
    }
    return [sourceFileKey(virtualPath), { fixturePath, virtualPath }]
  }))
}

let cachedSourceOverlays
function sourceOverlays() {
  if (cachedSourceOverlays) return cachedSourceOverlays
  if (LEGACY_SOURCE_OVERLAY_ROOT !== undefined) {
    throw new Error('RESPONSE_CONTRACT_SOURCE_OVERLAY: legacy generic overlays are forbidden')
  }
  if (TEST_SOURCE_OVERLAY_ROOT === undefined) {
    if (ALLOW_TEST_SOURCE_OVERLAY !== undefined) {
      throw new Error('RESPONSE_CONTRACT_ALLOW_TEST_OVERLAY requires RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY')
    }
    cachedSourceOverlays = new Map()
    return cachedSourceOverlays
  }
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY requires NODE_ENV=test')
  }
  if (ALLOW_TEST_SOURCE_OVERLAY !== '1') {
    throw new Error('RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY requires RESPONSE_CONTRACT_ALLOW_TEST_OVERLAY=1')
  }
  cachedSourceOverlays = validatedSourceOverlays(TEST_SOURCE_OVERLAY_ROOT)
  return cachedSourceOverlays
}

function createProgramWithSourceOverlays(rootNames, options) {
  const overlays = sourceOverlays()
  const host = ts.createCompilerHost(options)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const overlay = overlays.get(sourceFileKey(fileName))
    if (!overlay) return getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
    return ts.createSourceFile(
      fileName,
      fs.readFileSync(overlay.fixturePath, 'utf8'),
      languageVersion,
      true,
    )
  }
  return ts.createProgram({ rootNames, options, host })
}

function createProgram() {
  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json')
  if (!configPath) throw new Error('tsconfig.json not found')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT)
  return createProgramWithSourceOverlays(parsed.fileNames, parsed.options)
}

function findRouteCall(sourceFile, method, line) {
  const matches = []
  const visit = (node) => {
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && HTTP_METHODS.has(node.expression.name.text)
      && node.expression.name.text === method.toLowerCase()
      && sourceLine(sourceFile, node) === line) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (matches.length !== 1) {
    throw new Error(`${method} ${sourcePath(sourceFile)}:${line} resolves to ${matches.length} route declarations`)
  }
  return matches[0]
}

function unwrapExpression(expression) {
  let current = expression
  while (ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current)) {
    current = current.expression
  }
  return current
}

function aliasedSymbol(checker, node) {
  const symbol = checker.getSymbolAtLocation(node)
  if (!symbol) return undefined
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
}

function functionFromDeclaration(checker, declaration, seen) {
  if (ts.isFunctionDeclaration(declaration)
    || ts.isFunctionExpression(declaration)
    || ts.isArrowFunction(declaration)
    || ts.isMethodDeclaration(declaration)) {
    return declaration
  }
  if (ts.isPropertyDeclaration(declaration) && declaration.initializer) {
    const initializer = unwrapExpression(declaration.initializer)
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return initializer
    return resolveFunction(checker, initializer, seen)
  }
  if (ts.isBindingElement(declaration)
    && ts.isObjectBindingPattern(declaration.parent)
    && ts.isVariableDeclaration(declaration.parent.parent)
    && declaration.parent.parent.initializer
    && ts.isIdentifier(declaration.name)) {
    const property = checker.getTypeAtLocation(declaration.parent.parent.initializer).getProperty(declaration.name.text)
    for (const propertyDeclaration of property?.declarations ?? []) {
      const resolved = functionFromDeclaration(checker, propertyDeclaration, seen)
      if (resolved) return resolved
    }
  }
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    const initializer = unwrapExpression(declaration.initializer)
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return initializer
    return resolveFunction(checker, initializer, seen)
  }
  if (ts.isShorthandPropertyAssignment(declaration)) {
    const value = checker.getShorthandAssignmentValueSymbol(declaration)
    for (const valueDeclaration of value?.declarations ?? []) {
      const resolved = functionFromDeclaration(checker, valueDeclaration, seen)
      if (resolved) return resolved
    }
  }
  if (ts.isPropertyAssignment(declaration)) {
    const initializer = unwrapExpression(declaration.initializer)
    if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return initializer
    return resolveFunction(checker, initializer, seen)
  }
  return undefined
}

function returnedFunction(checker, factory, seen) {
  if (ts.isArrowFunction(factory)) {
    const body = unwrapExpression(factory.body)
    if (ts.isArrowFunction(body) || ts.isFunctionExpression(body)) return body
  }
  const matches = []
  const visit = (node) => {
    if (ts.isReturnStatement(node) && node.expression) {
      const resolved = resolveFunction(checker, node.expression, seen)
      if (resolved) matches.push(resolved)
      return
    }
    ts.forEachChild(node, visit)
  }
  if (factory.body) visit(factory.body)
  return matches.length === 1 ? matches[0] : undefined
}

function propertyFromFactory(checker, access, seen) {
  const baseSymbol = aliasedSymbol(checker, access.expression)
  if (!baseSymbol) return undefined
  for (const declaration of baseSymbol.declarations ?? []) {
    if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) continue
    const initializer = unwrapExpression(declaration.initializer)
    if (!ts.isCallExpression(initializer)) continue
    const factory = resolveFunction(checker, initializer.expression, new Set(seen))
    if (!factory?.body) continue
    let result
    const visit = (node) => {
      if (result || !ts.isReturnStatement(node) || !node.expression) {
        if (!result) ts.forEachChild(node, visit)
        return
      }
      const returned = unwrapExpression(node.expression)
      if (!ts.isObjectLiteralExpression(returned)) return
      const property = returned.properties.find((candidate) => propertyName(candidate.name) === access.name.text)
      if (!property) return
      if (ts.isMethodDeclaration(property)) result = property
      else if (ts.isPropertyAssignment(property)) result = resolveFunction(checker, property.initializer, new Set(seen))
      else if (ts.isShorthandPropertyAssignment(property)) {
        const value = checker.getShorthandAssignmentValueSymbol(property)
        for (const declaration of value?.declarations ?? []) {
          result = functionFromDeclaration(checker, declaration, new Set(seen))
          if (result) break
        }
      }
    }
    visit(factory.body)
    if (result) return result
  }
  return undefined
}

function resolveFunction(checker, expression, seen = new Set()) {
  const current = unwrapExpression(expression)
  if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) return current
  if (ts.isCallExpression(current)) {
    if (ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === 'bind') {
      return resolveFunction(checker, current.expression.expression, seen)
    }
    for (let index = current.arguments.length - 1; index >= 0; index -= 1) {
      const resolved = resolveFunction(checker, current.arguments[index], seen)
      if (resolved) return resolved
    }
    const factory = resolveFunction(checker, current.expression, seen)
    if (factory) return returnedFunction(checker, factory, seen)
  }
  if (ts.isPropertyAccessExpression(current)) {
    const fromFactory = propertyFromFactory(checker, current, seen)
    if (fromFactory) return fromFactory
  }
  const lookupNode = ts.isPropertyAccessExpression(current) ? current.name : current
  const symbol = aliasedSymbol(checker, lookupNode)
  if (!symbol || seen.has(symbol)) return undefined
  seen.add(symbol)
  for (const declaration of symbol.declarations ?? []) {
    const resolved = functionFromDeclaration(checker, declaration, seen)
    if (resolved) return resolved
  }
  return undefined
}

function responseNames(handler) {
  const names = new Set(['res', 'response'])
  const second = handler.parameters[1]?.name
  if (second && ts.isIdentifier(second)) names.add(second.text)
  return names
}

function rootIdentifier(expression) {
  let current = unwrapExpression(expression)
  while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
    current = unwrapExpression(current.expression)
  }
  return ts.isIdentifier(current) ? current.text : undefined
}

function statusValues(checker, expression) {
  const current = unwrapExpression(expression)
  if (ts.isNumericLiteral(current)) return [Number(current.text)]
  if (ts.isConditionalExpression(current)) {
    return [...statusValues(checker, current.whenTrue), ...statusValues(checker, current.whenFalse)]
  }
  const type = checker.getTypeAtLocation(current)
  const members = type.isUnion() ? type.types : [type]
  const values = members.flatMap((member) =>
    member.isNumberLiteral() ? [member.value] : [],
  )
  return values.length === members.length ? values : []
}

function statusForTerminal(checker, call) {
  let current = call.expression
  while (ts.isPropertyAccessExpression(current) || ts.isCallExpression(current)) {
    if (ts.isCallExpression(current)
      && ts.isPropertyAccessExpression(current.expression)
      && current.expression.name.text === 'status') {
      return current.arguments[0] ? statusValues(checker, current.arguments[0]) : []
    }
    current = current.expression
  }
  return undefined
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function objectShape(checker, expression, seen = new Set()) {
  const current = unwrapExpression(expression)
  if (ts.isConditionalExpression(current)) {
    const branchShape = (branch) => {
      const literal = objectShape(checker, branch, new Set(seen))
      if (literal) return literal
      const keys = checker.getTypeAtLocation(branch).getProperties().map((symbol) => symbol.name)
      return keys.length > 0 ? { keys, successTrue: false, dynamic: false } : undefined
    }
    const left = branchShape(current.whenTrue)
    const right = branchShape(current.whenFalse)
    return {
      keys: [...new Set([...(left?.keys ?? []), ...(right?.keys ?? [])])].sort(),
      successTrue: Boolean(left?.successTrue && right?.successTrue),
      dynamic: !left || !right || left.dynamic || right.dynamic,
    }
  }
  if (ts.isIdentifier(current)) {
    const symbol = aliasedSymbol(checker, current)
    if (symbol && !seen.has(symbol)) {
      seen.add(symbol)
      for (const declaration of symbol.declarations ?? []) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          const resolved = objectShape(checker, declaration.initializer, seen)
          if (resolved) return resolved
        }
      }
    }
  }
  if (!ts.isObjectLiteralExpression(current)) return undefined
  const keys = []
  let successTrue = false
  let dynamic = false
  for (const property of current.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = objectShape(checker, property.expression, new Set(seen))
      if (spread) {
        keys.push(...spread.keys)
        dynamic ||= spread.dynamic
      } else {
        const spreadKeys = checker.getTypeAtLocation(property.expression).getProperties().map((symbol) => symbol.name)
        keys.push(...spreadKeys)
        dynamic ||= spreadKeys.length === 0
      }
      continue
    }
    if (!ts.isPropertyAssignment(property)
      && !ts.isShorthandPropertyAssignment(property)
      && !ts.isMethodDeclaration(property)
      && !ts.isGetAccessorDeclaration(property)
      && !ts.isSetAccessorDeclaration(property)) {
      return undefined
    }
    const key = propertyName(property.name)
    if (!key) return undefined
    keys.push(key)
    if (key === 'success'
      && ts.isPropertyAssignment(property)
      && property.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      successTrue = true
    }
  }
  return { keys: [...new Set(keys)].sort(), successTrue, dynamic }
}
function returnExpressions(fn) {
  const expressions = []
  const visit = (node) => {
    if (node !== fn && ts.isFunctionLike(node)) return
    if (ts.isReturnStatement(node) && node.expression) {
      expressions.push(node.expression)
      return
    }
    ts.forEachChild(node, visit)
  }
  if (fn.body) visit(fn.body)
  return expressions
}

function initializerForIdentifier(checker, identifier) {
  const symbol = aliasedSymbol(checker, identifier)
  for (const declaration of symbol?.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) return declaration.initializer
    if (ts.isBindingElement(declaration)
      && ts.isVariableDeclaration(declaration.parent.parent)
      && declaration.parent.parent.initializer) {
      return declaration.parent.parent.initializer
    }
  }
  return undefined
}

function shapesFromType(checker, expression, suppliedType) {
  const type = suppliedType ?? checker.getTypeAtLocation(expression)
  if (!suppliedType && checker.getPromisedTypeOfPromise(type)) return []
  const members = type.isUnion() ? type.types : [type]
  const shapes = []
  for (const member of members) {
    if (checker.isArrayType(member) || checker.isTupleType(member)) {
      shapes.push({ kind: 'array', keys: [], successTrue: false, source: 'type' })
      continue
    }
    if (member.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.Null | ts.TypeFlags.Undefined)) {
      shapes.push({ kind: 'scalar', keys: [], successTrue: false, source: 'type' })
      continue
    }
    const keys = member.getProperties()
      .map((property) => property.name)
      .filter((key) => !key.startsWith('__@'))
      .sort()
    if (keys.length > 0) {
      const success = member.getProperty('success')
      const successType = success
        ? checker.getTypeOfSymbolAtLocation(success, expression)
        : undefined
      shapes.push({
        kind: 'object',
        keys,
        successTrue: successType?.flags === ts.TypeFlags.BooleanLiteral
          && successType.intrinsicName === 'true',
        source: 'type',
      })
      continue
    }
    return []

  }
  return shapes
}

function shapesFromExpression(checker, expression, seen = new Set()) {
  const current = unwrapExpression(expression)
  if (seen.has(current)) return []
  seen.add(current)

  if (ts.isAwaitExpression(current)) {
    const awaitedExpression = unwrapExpression(current.expression)
    if (ts.isCallExpression(awaitedExpression)) {
      const awaitedArgument = awaitedExpression.arguments[0]
      if (awaitedArgument
        && ts.isPropertyAccessExpression(awaitedExpression.expression)
        && ts.isIdentifier(awaitedExpression.expression.expression)
        && awaitedExpression.expression.expression.text === 'Promise'
        && awaitedExpression.expression.name.text === 'resolve') {
        return shapesFromExpression(checker, awaitedArgument, new Set(seen))
      }
      const producer = resolveFunction(checker, awaitedExpression.expression)
      if (producer) {
        const resolved = returnExpressions(producer).flatMap((returned) =>
          shapesFromExpression(checker, returned, new Set(seen)))
        return resolved
      }
    }
    const awaited = checker.getAwaitedType(checker.getTypeAtLocation(current.expression))
    return awaited ? shapesFromType(checker, current, awaited) : []
  }
  if (ts.isConditionalExpression(current)) {
    return [
      ...shapesFromExpression(checker, current.whenTrue, new Set(seen)),
      ...shapesFromExpression(checker, current.whenFalse, new Set(seen)),
    ]
  }
  if (ts.isArrayLiteralExpression(current)) {
    return [{ kind: 'array', keys: [], successTrue: false, source: 'literal' }]
  }
  if (ts.isObjectLiteralExpression(current)) {
    const shape = objectShape(checker, current)
    return shape && !shape.dynamic
      ? [{ kind: 'object', ...shape, source: 'literal' }]
      : []
  }
  if (ts.isIdentifier(current)) {
    const narrowed = shapesFromType(checker, current)
    if (narrowed.length > 0) return narrowed
    const initializer = initializerForIdentifier(checker, current)
    if (initializer) {
      const resolved = shapesFromExpression(checker, initializer, seen)
      if (resolved.length > 0) return resolved
    }
  }
  if (ts.isCallExpression(current)) {
    const producer = resolveFunction(checker, current.expression)
    if (producer) {
      const resolved = returnExpressions(producer).flatMap((returned) =>
        shapesFromExpression(checker, returned, new Set(seen)))
      if (resolved.length > 0) return resolved
    }
  }
  return shapesFromType(checker, current)
}

function objectProperty(object, name) {
  return object.properties.find((property) =>
    propertyName(property.name) === name && ts.isPropertyAssignment(property))
}

function correlatedBodyShapes(checker, call) {
  const body = call.arguments[0]
  if (!body || !ts.isPropertyAccessExpression(body)) return []
  const status = statusForTerminal(checker, call)
  if (!status || !status.some((value) => value < 400)) return []
  const base = unwrapExpression(body.expression)
  if (!ts.isIdentifier(base)) return []
  const initializer = initializerForIdentifier(checker, base)
  if (!initializer) return []
  const current = unwrapExpression(initializer)
  const invoked = ts.isAwaitExpression(current) ? unwrapExpression(current.expression) : current
  if (!ts.isCallExpression(invoked)) return []
  const producer = resolveFunction(checker, invoked.expression)
  if (!producer) return []

  const shapes = []
  for (const returned of returnExpressions(producer)) {
    const candidate = unwrapExpression(returned)
    if (!ts.isObjectLiteralExpression(candidate)) continue
    const statusProperty = objectProperty(candidate, 'status')
    const bodyProperty = objectProperty(candidate, body.name.text)
    if (!statusProperty || !bodyProperty) continue
    const values = statusValues(checker, statusProperty.initializer)
    if (!values.some((value) => value < 400)) continue
    shapes.push(...shapesFromExpression(checker, bodyProperty.initializer))
  }
  return shapes
}

function classifyResolvedShapes(shapes, correlated) {
  const objectShapes = shapes.filter((shape) => shape.kind === 'object')
  const keys = [...new Set(objectShapes.flatMap((shape) => shape.keys))].sort()
  if (objectShapes.length === shapes.length && objectShapes.length > 0) {
    const exactSuccessData = objectShapes.every((shape) =>
      shape.successTrue && shape.keys.length === 2
      && shape.keys[0] === 'data' && shape.keys[1] === 'success')
    if (exactSuccessData) return { family: 'success-data', shapeKeys: keys }
    if (correlated || objectShapes.every((shape) => shape.keys.includes('success'))) {
      return { family: 'domain-envelope', shapeKeys: keys }
    }
    return { family: 'raw-json', shapeKeys: keys }
  }
  if (objectShapes.length > 0) return { family: 'domain-envelope', shapeKeys: keys }
  return { family: 'raw-json', shapeKeys: [] }
}

function isCanonicalSuccessResponseCall(checker, expression) {
  const current = unwrapExpression(expression)
  if (!ts.isCallExpression(current) || !ts.isIdentifier(current.expression)) return false
  const symbol = aliasedSymbol(checker, current.expression)
  return Boolean(symbol?.declarations?.some((declaration) =>
    ts.isFunctionDeclaration(declaration)
    && ['operationalSuccessResponse', 'successResponse'].includes(declaration.name?.text ?? '')
    && sourceFileKey(declaration.getSourceFile().fileName) === sourceFileKey(path.join(ROOT, 'src', 'contracts', 'responseContract.ts'))))
}
function canonicalSuccessResponseShape(call) {
  const meta = call.arguments[1]
  const omitsMeta = !meta || (ts.isIdentifier(unwrapExpression(meta)) && unwrapExpression(meta).text === 'undefined')
  return (omitsMeta ? ['data', 'success'] : ['data', 'meta', 'success'])
}
function classifyBody(checker, method, call) {
  if (method === 'redirect') return { family: 'redirect', shapeKeys: [] }
  if (['download', 'sendFile', 'writeHead', 'write'].includes(method)) return { family: 'stream-or-file', shapeKeys: [] }
  if (method === 'end' || method === 'sendStatus') return { family: 'no-content', shapeKeys: [] }
  const body = call.arguments[0]
  if (!body) return { family: 'no-content', shapeKeys: [] }
  if (isCanonicalSuccessResponseCall(checker, body)) {
    return { family: 'success-data', shapeKeys: canonicalSuccessResponseShape(body) }
  }
  const direct = objectShape(checker, body)
  if (direct && !direct.dynamic) {
    const exactCanonicalEnvelope = direct.successTrue && (
      (direct.keys.length === 2
        && direct.keys[0] === 'data'
        && direct.keys[1] === 'success')
      || (direct.keys.length === 3
        && direct.keys[0] === 'data'
        && direct.keys[1] === 'meta'
        && direct.keys[2] === 'success')
    )
    if (exactCanonicalEnvelope) {
      return { family: 'success-data', shapeKeys: direct.keys }
    }
    return { family: 'domain-envelope', shapeKeys: direct.keys }
  }

  const correlated = correlatedBodyShapes(checker, call)
  const shapes = correlated.length > 0
    ? correlated
    : shapesFromExpression(checker, body)
  if (shapes.length === 0) {
    return { problem: `response expression is unresolved: ${body.getText(body.getSourceFile())}` }
  }
  return classifyResolvedShapes(shapes, correlated.length > 0)
}
function terminalResponse(checker, call, names) {
  if (!ts.isPropertyAccessExpression(call.expression)) return undefined
  const method = call.expression.name.text
  if (!TERMINAL_METHODS.has(method)) return undefined
  if (!names.has(rootIdentifier(call.expression.expression))) return undefined
  const statuses = method === 'sendStatus'
    ? (call.arguments[0] ? statusValues(checker, call.arguments[0]) : [])
    : statusForTerminal(checker, call)
  if (statuses && statuses.length === 0) return { problem: `response status for ${method} is not statically numeric` }
  const classified = classifyBody(checker, method, call)
  const successful = !statuses || statuses.some((status) => status < 400)
  return { ...classified, successful, statuses }
}

function pipeResponse(call, names) {
  if (!ts.isPropertyAccessExpression(call.expression)
    || call.expression.name.text !== 'pipe'
    || !call.arguments.some((argument) => {
      const current = unwrapExpression(argument)
      return ts.isIdentifier(current) && names.has(current.text)
    })) {
    return undefined
  }
  return { family: 'stream-or-file', shapeKeys: [] }
}

function aggregateExits(exits, handler) {
  const problems = exits.flatMap((exit) => exit.problem ? [exit.problem] : [])
  if (problems.length > 0) return { problems: [...new Set(problems)].sort(), handler: handlerEvidence(handler) }
  const allClassified = exits.filter((exit) => exit.family)
  if (allClassified.length === 0) return { problems: ['no response exit found'], handler: handlerEvidence(handler) }
  const successful = allClassified.filter((exit) => exit.successful !== false)
  const onlyNotImplemented = successful.length === 0 && allClassified.every((exit) =>
    Array.isArray(exit.statuses) && exit.statuses.length > 0 && exit.statuses.every((status) => status === 501))
  if (onlyNotImplemented) {
    const first = allClassified
      .map((exit) => ({ file: sourcePath(exit.node.getSourceFile()), line: sourceLine(exit.node.getSourceFile(), exit.node) }))
      .sort((left, right) => left.file.localeCompare(right.file, 'en') || left.line - right.line)[0]
    return {
      decision: {
        family: '501-only',
        shapeKeys: [],
        evidence: `no successful exit (501-only); ${first.file}:${first.line}`,
      },
      handler: handlerEvidence(handler),
    }
  }
  const classified = successful.length > 0 ? successful : allClassified
  const families = new Set(classified.map((exit) => exit.family))
  const precedence = ['redirect', 'stream-or-file', 'no-content']
  let family = precedence.find((candidate) => families.has(candidate))
  const jsonFamilies = [...families].filter((candidate) => !precedence.includes(candidate))
  const dynamic = classified.some((exit) => exit.dynamic)
  const mixed = families.size > 1
  if (!family) family = jsonFamilies.length === 1 ? jsonFamilies[0] : 'domain-envelope'
  const shapeKeys = [...new Set(classified.flatMap((exit) => exit.shapeKeys ?? []))].sort()
  const first = classified
    .map((exit) => ({ file: sourcePath(exit.node.getSourceFile()), line: sourceLine(exit.node.getSourceFile(), exit.node) }))
    .sort((left, right) => left.file.localeCompare(right.file, 'en') || left.line - right.line)[0]
  const prefix = mixed
    ? `mixed success exits (${[...families].sort().join(', ')}); `
    : dynamic ? 'dynamic response spread; ' : ''
  return { decision: { family, shapeKeys, evidence: `${prefix}${first.file}:${first.line}` }, handler: handlerEvidence(handler) }
}

function handlerEvidence(handler) {
  return `${sourcePath(handler.getSourceFile())}:${sourceLine(handler.getSourceFile(), handler)}`
}

function collectExits(checker, handler, exits, visited) {
  if (visited.has(handler)) return
  visited.add(handler)
  const names = responseNames(handler)
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const terminal = terminalResponse(checker, node, names) ?? pipeResponse(node, names)
      if (terminal) exits.push({ ...terminal, node })
      if (!terminal && node.arguments.some((argument) => {
        const current = unwrapExpression(argument)
        return ts.isIdentifier(current) && names.has(current.text)
      })) {
        const delegated = resolveFunction(checker, node.expression)
        if (delegated) collectExits(checker, delegated, exits, visited)
      }
    }
    ts.forEachChild(node, visit)
  }
  if (handler.body) visit(handler.body)
}

function inspectHandler(checker, handler) {
  const exits = []
  collectExits(checker, handler, exits, new Set())
  return aggregateExits(exits, handler)
}

function frontSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : frontSourceFiles(absolute)
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.') ? [absolute] : []
  })
}

function frontDeclarations(sourceFile) {
  const initializers = new Map()
  const helpers = new Map()
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const returned = node.body.statements.find(ts.isReturnStatement)?.expression
      if (returned) helpers.set(node.name.text, {
        parameters: node.parameters.map((parameter) => parameter.name.getText(sourceFile)),
        body: returned,
      })
    }
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
        if (ts.isArrowFunction(declaration.initializer) && !ts.isBlock(declaration.initializer.body)) {
          helpers.set(declaration.name.text, {
            parameters: declaration.initializer.parameters.map((parameter) => parameter.name.getText(sourceFile)),
            body: declaration.initializer.body,
          })
        } else {
          initializers.set(declaration.name.text, declaration.initializer)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { initializers, helpers }
}

function frontTransportIdentifiers(sourceFile) {
  const identifiers = new Set()
  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !node.importClause) return
    const specifier = ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : ''
    if (!/(?:^|\/)httpClient$/.test(specifier) && !/(?:^|\/)services\/api$/.test(specifier) && specifier !== './api') return
    if (node.importClause.name) identifiers.add(node.importClause.name.text)
    const bindings = node.importClause.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if ((element.propertyName ?? element.name).text === 'httpClient') identifiers.add(element.name.text)
      }
    }
  })
  return identifiers
}

function frontLiteralTypeValues(checker, expression) {
  const type = checker.getTypeAtLocation(expression)
  const types = type.isUnion() ? type.types : [type]
  const values = types.flatMap((candidate) => candidate.flags & ts.TypeFlags.StringLiteral ? [candidate.value] : [])
  return values.length === types.length ? [...new Set(values)] : []
}

function frontPathValues(expression, context) {
  if (ts.isStringLiteralLike(expression)) return [expression.text]
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isNonNullExpression(expression)) {
    return frontPathValues(expression.expression, context)
  }
  if (ts.isIdentifier(expression)) {
    const binding = context.bindings.get(expression.text)
    if (binding !== undefined) return Array.isArray(binding) ? binding : [binding]
    const initializer = context.initializers.get(expression.text)
    if (!initializer || context.resolving.has(expression.text)) {
      const literals = frontLiteralTypeValues(context.checker, expression)
      return literals.length > 0 ? literals : ['*']
    }
    return frontPathValues(initializer, { ...context, resolving: new Set(context.resolving).add(expression.text) })
  }
  if (ts.isConditionalExpression(expression)) {
    return [...frontPathValues(expression.whenTrue, context), ...frontPathValues(expression.whenFalse, context)]
  }
  if (ts.isCallExpression(expression)) {
    if (ts.isIdentifier(expression.expression) && expression.expression.text === 'encodeURIComponent') return ['*']
    if (ts.isIdentifier(expression.expression)) {
      const helper = context.helpers.get(expression.expression.text)
      if (helper && !context.resolving.has(expression.expression.text)) {
        const bindings = new Map(context.bindings)
        helper.parameters.forEach((parameter, index) => {
          const values = expression.arguments[index] ? frontPathValues(expression.arguments[index], context) : ['*']
          bindings.set(parameter, values.length > 0 ? values : ['*'])
        })
        return frontPathValues(helper.body, {
          ...context,
          bindings,
          resolving: new Set(context.resolving).add(expression.expression.text),
        })
      }
    }
    return []
  }
  if (!ts.isTemplateExpression(expression)) return []
  let results = [expression.head.text]
  for (const span of expression.templateSpans) {
    const resolved = frontPathValues(span.expression, context)
    const values = resolved.length > 0 ? resolved : ['*']
    results = results.flatMap((prefix) => values.map((value) => `${prefix}${value}${span.literal.text}`))
  }
  return [...new Set(results)]
}

function extractFrontCalls() {
  const srcRoot = path.join(FRONT_ROOT, 'src')
  if (!fs.existsSync(srcRoot)) throw new Error(`Front source root is missing: ${srcRoot}`)
  const configPath = ts.findConfigFile(FRONT_ROOT, ts.sys.fileExists, 'tsconfig.json')
  if (!configPath) throw new Error(`Front tsconfig.json is missing: ${FRONT_ROOT}`)
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, FRONT_ROOT)
  const extraFiles = FRONT_EXTRA_SOURCE
    ? (fs.statSync(FRONT_EXTRA_SOURCE).isDirectory() ? frontSourceFiles(FRONT_EXTRA_SOURCE) : [FRONT_EXTRA_SOURCE])
    : []
  const program = createProgramWithSourceOverlays(parsed.fileNames, parsed.options)
  const checker = program.getTypeChecker()
  const calls = []
  const unresolvedCalls = []
  const files = [...new Set([...frontSourceFiles(srcRoot), ...extraFiles])]
  for (const file of files) {
    const sourceFile = program.getSourceFile(file)
      ?? ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const transports = frontTransportIdentifiers(sourceFile)
    if (transports.size === 0) continue
    const context = { ...frontDeclarations(sourceFile), bindings: new Map(), resolving: new Set(), checker }
    const visit = (node) => {
      if (ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && transports.has(node.expression.expression.text)
        && ['get', 'post', 'put', 'patch', 'delete', 'getUri'].includes(node.expression.name.text)
        && node.arguments[0]) {
        const clientMethod = node.expression.name.text
        const method = clientMethod === 'getUri' ? 'GET' : clientMethod.toUpperCase()
        const pathExpression = clientMethod === 'getUri' && ts.isObjectLiteralExpression(node.arguments[0])
          ? node.arguments[0].properties.find((property) =>
              ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === 'url')?.initializer
          : node.arguments[0]
        const line = sourceLine(sourceFile, node)
        const fileName = slash(path.relative(FRONT_ROOT, file))
        const values = pathExpression ? frontPathValues(pathExpression, context).filter((value) => value.startsWith('/')) : []
        if (values.length === 0) {
          unresolvedCalls.push({
            method,
            expression: pathExpression?.getText(sourceFile) ?? node.arguments[0].getText(sourceFile),
            file: fileName,
            line,
          })
        }
        for (const value of values) {
          calls.push({
            method,
            path: value.split(/[?#]/)[0],
            file: fileName,
            line,
          })
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return {
    calls: [...new Map(calls.map((call) => [`${call.method}:${call.path}:${call.file}`, call])).values()],
    unresolvedCalls,
  }
}

function frontRouteMatches(call, route) {
  if (call.method !== route.method) return false
  const callPath = call.path.startsWith('/api/') ? call.path : `/api${call.path}`
  const callSegments = callPath.split('/').filter(Boolean)
  const routeSegments = route.path.split('/').filter(Boolean)
  return callSegments.length === routeSegments.length
    && callSegments.every((segment, index) => routeSegments[index] === '*'
      || routeSegments[index]?.startsWith(':')
      || segment === routeSegments[index])
}

let cachedFrontSnapshot
function frontSnapshot(routes) {
  if (cachedFrontSnapshot) return cachedFrontSnapshot
  const { calls, unresolvedCalls } = extractFrontCalls()
  const consumers = new Map()
  const unmatchedCalls = []
  for (const call of calls) {
    const matches = routes.filter((candidate) => frontRouteMatches(call, candidate))
    if (matches.length === 0) {
      unmatchedCalls.push(call)
      continue
    }
    const specificity = (candidate) => candidate.path.split('/').filter((segment) => segment && !segment.startsWith(':') && segment !== '*').length
    const maximum = matches.reduce((current, candidate) => Math.max(current, specificity(candidate)), -1)
    for (const match of matches.filter((candidate) => specificity(candidate) === maximum)) {
      const key = identity(match)
      const files = consumers.get(key) ?? []
      consumers.set(key, [...new Set([...files, call.file])].sort())
    }
  }
  const problems = [
    ...unresolvedCalls.map((call) =>
      `unresolved Front call: ${call.file}:${call.line}: ${call.method} ${call.expression}`),
    ...unmatchedCalls.map((call) =>
      `unmatched Front call: ${call.file}:${call.line}: ${call.method} ${call.path}`),
  ].sort()
  if (problems.length > 0) throw new Error(`Front contract scan failed:\n${problems.join('\n')}`)
  cachedFrontSnapshot = { consumers, callCount: calls.length }
  return cachedFrontSnapshot
}

function discoverDecisions(routes) {
  const front = frontSnapshot(routes)
  const program = createProgram()
  const checker = program.getTypeChecker()
  const decisions = []
  const problems = []
  for (const route of routes) {
    try {
      const evidence = routeEvidence(route)
      const absolute = path.join(ROOT, evidence.file)
      const sourceFile = program.getSourceFile(absolute)
      if (!sourceFile) throw new Error(`${evidence.file} is not in the TypeScript program`)
      const declaration = findRouteCall(sourceFile, route.method, evidence.line)
      const handlerExpression = declaration.arguments[declaration.arguments.length - 1]
      if (!handlerExpression) throw new Error('route has no handler argument')
      const handler = resolveFunction(checker, handlerExpression)
      if (!handler) throw new Error(`handler ${handlerExpression.getText(sourceFile)} is unresolved`)
      const result = inspectHandler(checker, handler)
      if (!result.decision) throw new Error(`${result.handler}: ${result.problems.join('; ')}`)
      const discovered = { method: route.method, path: route.path, ...result.decision, frontConsumer: front.consumers.get(identity(route))?.[0] ?? null }
      if (PUBLIC_DOCUMENT_IDENTITIES.has(identity(route))) {
        if (!['domain-envelope', 'raw-json'].includes(discovered.family)) {
          throw new Error(`${identity(route)} reviewed public document no longer resolves to a public JSON document`)
        }
        discovered.family = 'public-document'
      }
      if (CANONICAL_ADMIN_IDENTITIES.has(identity(route))) {
        discovered.family = 'success-data'
        discovered.shapeKeys = ['data', 'success']
      }
      if (WEBHOOK_ACK_IDENTITIES.has(identity(route))) {
        if (!['domain-envelope', 'raw-json'].includes(discovered.family)) {
          throw new Error(`${identity(route)} reviewed webhook ACK no longer resolves to provider JSON`)
        }
        discovered.family = 'webhook-ack'
      }
      decisions.push(discovered)
    } catch (error) {
      problems.push(`${identity(route)}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (problems.length > 0) throw new Error(`Unable to classify ${problems.length} routes:\n${problems.join('\n')}`)
  return decisions.sort(compareIdentities)
}

function validateExactMembership(routes, decisions, label, requireTerminal = false) {
  const routeIds = routes.map(identity).sort()
  const decisionIds = decisions.map(identity).sort()
  const duplicateRoutes = routeIds.filter((entry, index) => entry === routeIds[index - 1])
  const duplicateDecisions = decisionIds.filter((entry, index) => entry === decisionIds[index - 1])
  const routeSet = new Set(routeIds)
  const decisionSet = new Set(decisionIds)
  const missing = routeIds.filter((entry) => !decisionSet.has(entry))
  const orphaned = decisionIds.filter((entry) => !routeSet.has(entry))
  const invalid = requireTerminal
    ? decisions.filter((entry) => !TERMINAL_FAMILIES.has(entry.family)).map(identity)
    : []
  const problems = [
    ...duplicateRoutes.map((entry) => `duplicate route: ${entry}`),
    ...duplicateDecisions.map((entry) => `duplicate ${label}: ${entry}`),
    ...missing.map((entry) => `missing ${label}: ${entry}`),
    ...orphaned.map((entry) => `orphaned ${label}: ${entry}`),
    ...invalid.map((entry) => `forbidden terminal response family: ${entry}`),
  ]
  if (problems.length > 0) throw new Error(problems.join('\n'))
}
const serialize = (decisions) => `${JSON.stringify(decisions, null, 2)}\n`

function reviewedDecisions(routes) {
  if (!fs.existsSync(RESPONSE_CATALOG_PATH)) {
    throw new Error(`Response catalog is missing: ${slash(path.relative(ROOT, RESPONSE_CATALOG_PATH))}`)
  }
  const decisions = readJson(RESPONSE_CATALOG_PATH)
  validateExactMembership(routes, decisions, 'response decision', true)
  return decisions.map((decision) => ({
    ...decision,
    shapeKeys: [...new Set(decision.shapeKeys)].sort(),
  })).sort(compareIdentities)
}

function reviewedMigrationInventory(routes) {
  if (!fs.existsSync(RESPONSE_MIGRATION_INVENTORY_PATH)) {
    throw new Error(`Response migration inventory is missing: ${slash(path.relative(ROOT, RESPONSE_MIGRATION_INVENTORY_PATH))}`)
  }
  const inventory = readJson(RESPONSE_MIGRATION_INVENTORY_PATH)
  const decisions = inventory.map((entry) => {
    const separator = entry.identity.indexOf(' ')
    return { method: entry.identity.slice(0, separator), path: entry.identity.slice(separator + 1) }
  })
  validateExactMembership(routes, decisions, 'migration inventory entry')
  const publicIds = inventory.filter((entry) => entry.targetFamily === 'public-document').map((entry) => entry.identity).sort()
  const expectedPublicIds = routes.map(identity).filter((routeId) => PUBLIC_DOCUMENT_IDENTITIES.has(routeId)).sort()
  const invalid = inventory.flatMap((entry) => {
    const problems = []
    if (!CURRENT_FAMILIES.has(entry.currentFamily)) problems.push(`${entry.identity} has invalid current family: ${entry.currentFamily}`)
    if (!TERMINAL_FAMILIES.has(entry.targetFamily)) problems.push(`${entry.identity} has forbidden target family: ${entry.targetFamily}`)
    if (!/^src\/.+\.ts$/.test(entry.owner)) problems.push(`${entry.identity} has invalid owner: ${entry.owner}`)
    if (entry.status !== 'complete' && entry.status !== 'pending-migration') problems.push(`${entry.identity} has invalid status: ${entry.status}`)
    if ((entry.currentFamily === entry.targetFamily) !== (entry.status === 'complete')) problems.push(`${entry.identity} has inconsistent status`)
    return problems
  })
  if (JSON.stringify(publicIds) !== JSON.stringify(expectedPublicIds)) {
    invalid.push(`reviewed public-document membership differs: expected ${expectedPublicIds.join(', ')}`)
  }
  if (invalid.length > 0) throw new Error(invalid.join('\n'))
  return inventory.slice().sort((left, right) => left.identity.localeCompare(right.identity, 'en'))
}
function ownerFromEvidence(evidence) {
  const match = evidence.match(/(src\/.+\.ts):\d+$/)
  if (!match) throw new Error(`invalid response evidence: ${evidence}`)
  return match[1]
}

function driftMessages(reviewed, discovered, inventory) {
  const inventoryById = new Map(inventory.map((entry) => [entry.identity, entry]))
  const catalogById = new Map(reviewed.map((entry) => [identity(entry), entry]))
  const messages = []
  for (const decision of discovered) {
    const routeId = identity(decision)
    const entry = inventoryById.get(routeId)
    const catalog = catalogById.get(routeId)
    if (!entry || !catalog) continue
    const actual = JSON.stringify({ family: decision.family, shapeKeys: decision.shapeKeys, evidence: decision.evidence, frontConsumer: decision.frontConsumer, owner: ownerFromEvidence(decision.evidence) })
    const expected = JSON.stringify({ family: entry.currentFamily, shapeKeys: catalog.shapeKeys, evidence: catalog.evidence, frontConsumer: entry.frontConsumer, owner: entry.owner })
    if (actual !== expected) {
      if (entry.currentFamily !== decision.family) messages.push(`${routeId} current response family changed: old=${entry.currentFamily}; new=${decision.family}`)
      messages.push(`${routeId} differs from reviewed migration inventory: expected ${expected}; discovered ${actual}`)
    }
    if (catalog.family !== entry.targetFamily) {
      messages.push(`${routeId} terminal family differs from migration inventory: catalog=${catalog.family}; target=${entry.targetFamily}`)
    }
    if (catalog.frontConsumer !== entry.frontConsumer) {
      messages.push(`${routeId} Front consumer differs from migration inventory: catalog=${catalog.frontConsumer}; inventory=${entry.frontConsumer}`)
    }
  }
  return messages
}
function main() {
  const mode = process.argv[2]
  if (mode !== '--check' && mode !== '--write') throw new Error('Usage: generate-response-contract-catalog.mjs --check|--write')
  sourceOverlays()
  const routes = readJson(ROUTE_CATALOG_PATH)
  const reviewed = reviewedDecisions(routes)
  const inventory = reviewedMigrationInventory(routes)
  const discovered = discoverDecisions(routes)
  validateExactMembership(routes, discovered, 'discovered response decision')

  const drift = driftMessages(reviewed, discovered, inventory)
  if (drift.length > 0) {
    throw new Error(`Response catalog drift:\n${drift.join('\n')}`)
  }
  const expected = serialize(reviewed)
  if (mode === '--write') {
    fs.writeFileSync(RESPONSE_CATALOG_PATH, expected, 'utf8')
    process.stdout.write(`Retained ${reviewed.length} reviewed response decisions.\n`)
    return
  }
  if (fs.readFileSync(RESPONSE_CATALOG_PATH, 'utf8') !== expected) {
    throw new Error('Response catalog is not deterministically formatted; reviewer must run contracts:responses:update')
  }
  const front = frontSnapshot(routes)
  process.stdout.write(`Response catalog is current (${reviewed.length} decisions; ${front.callCount} Front calls; ${front.consumers.size} consumers).\n`)
}
try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
