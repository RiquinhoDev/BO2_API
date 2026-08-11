import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const ROOT = process.cwd()
const ROUTE_CATALOG_PATH = process.env.RESPONSE_CONTRACT_ROUTE_CATALOG ?? path.join(ROOT, 'src', 'security', 'route-catalog.json')
const RESPONSE_CATALOG_PATH = process.env.RESPONSE_CONTRACT_CATALOG ?? path.join(ROOT, 'src', 'contracts', 'response-contract-catalog.json')
const FRONT_ROOT = path.resolve(ROOT, '..', 'Front')
const FAMILIES = new Set(['success-data', 'domain-envelope', 'raw-json', 'no-content', 'redirect', 'stream-or-file'])
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

function createProgram() {
  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json')
  if (!configPath) throw new Error('tsconfig.json not found')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT)
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
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
    const left = objectShape(checker, current.whenTrue, new Set(seen))
    const right = objectShape(checker, current.whenFalse, new Set(seen))
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
function classifyBody(checker, method, call) {
  if (method === 'redirect') return { family: 'redirect', shapeKeys: [] }
  if (['download', 'sendFile', 'writeHead', 'write'].includes(method)) return { family: 'stream-or-file', shapeKeys: [] }
  if (method === 'end' || method === 'sendStatus') return { family: 'no-content', shapeKeys: [] }
  const body = call.arguments[0]
  if (!body) return { family: 'no-content', shapeKeys: [] }
  const shape = objectShape(checker, body)
  if (!shape) return { family: 'raw-json', shapeKeys: [] }

  if (shape.successTrue
    && !shape.dynamic
    && shape.keys.length === 2
    && shape.keys[0] === 'data'
    && shape.keys[1] === 'success') {
    return { family: 'success-data', shapeKeys: shape.keys, dynamic: false }
  }
  return { family: 'domain-envelope', shapeKeys: shape.keys, dynamic: shape.dynamic }
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
  return { ...classified, successful }
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

function frontConsumer(route) {
  if (route.consumer !== 'front') return null
  const candidates = [...route.evidence.matchAll(/<([^>]+\.(?:ts|tsx))>/g)].map((match) => match[1])
  const existing = candidates.filter((candidate) => fs.existsSync(path.join(FRONT_ROOT, candidate)))
  if (existing.length === 0) throw new Error(`${identity(route)} is marked front but has no existing Front evidence path`)
  return existing.sort()[0]
}

function discoverDecisions(routes) {
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
      decisions.push({ method: route.method, path: route.path, ...result.decision, frontConsumer: frontConsumer(route) })
    } catch (error) {
      problems.push(`${identity(route)}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (problems.length > 0) throw new Error(`Unable to classify ${problems.length} routes:\n${problems.join('\n')}`)
  return decisions.sort(compareIdentities)
}

function validateExactMembership(routes, decisions) {
  const routeIds = routes.map(identity).sort()
  const decisionIds = decisions.map(identity).sort()
  const duplicateRoutes = routeIds.filter((entry, index) => entry === routeIds[index - 1])
  const duplicateDecisions = decisionIds.filter((entry, index) => entry === decisionIds[index - 1])
  const routeSet = new Set(routeIds)
  const decisionSet = new Set(decisionIds)
  const missing = routeIds.filter((entry) => !decisionSet.has(entry))
  const orphaned = decisionIds.filter((entry) => !routeSet.has(entry))
  const invalid = decisions.filter((entry) => !FAMILIES.has(entry.family)).map(identity)
  const problems = [
    ...duplicateRoutes.map((entry) => `duplicate route: ${entry}`),
    ...duplicateDecisions.map((entry) => `duplicate response decision: ${entry}`),
    ...missing.map((entry) => `missing response decision: ${entry}`),
    ...orphaned.map((entry) => `orphaned response decision: ${entry}`),
    ...invalid.map((entry) => `invalid or unclassified response family: ${entry}`),
  ]
  if (problems.length > 0) throw new Error(problems.join('\n'))
}

const serialize = (decisions) => `${JSON.stringify(decisions, null, 2)}\n`

function reviewedDecisions(routes) {
  if (!fs.existsSync(RESPONSE_CATALOG_PATH)) {
    throw new Error(`Response catalog is missing: ${slash(path.relative(ROOT, RESPONSE_CATALOG_PATH))}`)
  }
  const decisions = readJson(RESPONSE_CATALOG_PATH)
  validateExactMembership(routes, decisions)
  return decisions.map((decision) => ({
    ...decision,
    shapeKeys: [...new Set(decision.shapeKeys)].sort(),
  })).sort(compareIdentities)
}

function driftMessages(reviewed, discovered) {
  const discoveredById = new Map(discovered.map((decision) => [identity(decision), decision]))
  return reviewed.flatMap((decision) => {
    const current = discoveredById.get(identity(decision))
    if (!current) return [`${identity(decision)} is not discoverable`]
    const reviewedContract = JSON.stringify({
      family: decision.family,
      shapeKeys: decision.shapeKeys,
      evidence: decision.evidence,
      frontConsumer: decision.frontConsumer,
    })
    const discoveredContract = JSON.stringify({
      family: current.family,
      shapeKeys: current.shapeKeys,
      evidence: current.evidence,
      frontConsumer: current.frontConsumer,
    })
    return reviewedContract === discoveredContract
      ? []
      : [`${identity(decision)} differs from source-derived evidence`]
  })
}

function main() {
  const mode = process.argv[2]
  if (mode !== '--check' && mode !== '--write') throw new Error('Usage: generate-response-contract-catalog.mjs --check|--write')
  const routes = readJson(ROUTE_CATALOG_PATH)
  const reviewed = reviewedDecisions(routes)
  const discovered = discoverDecisions(routes)
  validateExactMembership(routes, discovered)
  const drift = driftMessages(reviewed, discovered)
  if (drift.length > 0) throw new Error(`Response catalog drift:\n${drift.join('\n')}`)
  const expected = serialize(reviewed)
  if (mode === '--write') {
    fs.writeFileSync(RESPONSE_CATALOG_PATH, expected, 'utf8')
    process.stdout.write(`Retained ${reviewed.length} reviewed response decisions.\n`)
    return
  }
  if (fs.readFileSync(RESPONSE_CATALOG_PATH, 'utf8') !== expected) {
    throw new Error('Response catalog is not deterministically formatted; reviewer must run contracts:responses:update')
  }
  process.stdout.write(`Response catalog is current (${reviewed.length} decisions).\n`)
}
try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
