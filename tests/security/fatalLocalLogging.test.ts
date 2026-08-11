import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

interface FatalLocalLog {
  file: string
  line: number
  text: string
}

const logMethods = new Set(['debug', 'error', 'info', 'log', 'warn'])

function collectTypeScriptFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(absolute))
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(absolute)
    }
  }
  return files
}

function receiverRoot(expression: ts.Expression): string {
  let current = expression
  while (ts.isPropertyAccessExpression(current)) {
    current = current.expression
  }
  return ts.isIdentifier(current) ? current.text : current.getText()
}

function isLocalLoggerCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return false
  }
  if (!logMethods.has(node.expression.name.text)) {
    return false
  }
  const root = receiverRoot(node.expression.expression)
  return root === 'console' || /logger/i.test(root)
}

function isCentralDelegation(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) {
    return false
  }
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text === 'next' || node.expression.text === 'forwardApplicationError'
  }
  return ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'forwardApplicationError'
}

function descendants(
  catchClause: ts.CatchClause,
  predicate: (node: ts.Node) => boolean,
): ts.Node[] {
  const matches: ts.Node[] = []
  function visit(node: ts.Node): void {
    if (node !== catchClause && ts.isCatchClause(node)) {
      return
    }
    if (predicate(node)) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(catchClause.block)
  return matches
}


function nestedCatchClauses(catchClause: ts.CatchClause): ts.CatchClause[] {
  const matches: ts.CatchClause[] = []
  function visit(node: ts.Node): void {
    if (node !== catchClause && ts.isCatchClause(node)) {
      matches.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(catchClause.block)
  return matches
}

function referencesIdentifier(node: ts.Node, names: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(node) && names.has(node.text)) {
    return true
  }
  let found = false
  ts.forEachChild(node, (child) => {
    if (!found && referencesIdentifier(child, names)) {
      found = true
    }
  })
  return found
}

function enclosingCatchVariables(node: ts.Node, boundary: ts.CatchClause): Set<string> {
  const names = new Set<string>()
  let current: ts.Node | undefined = node
  while (current !== undefined) {
    if (
      ts.isCatchClause(current)
      && current.variableDeclaration !== undefined
      && ts.isIdentifier(current.variableDeclaration.name)
    ) {
      names.add(current.variableDeclaration.name.text)
    }
    if (current === boundary) {
      break
    }
    current = current.parent
  }
  return names
}

function isUnsafeNestedCompensationLog(
  node: ts.CallExpression,
  boundary: ts.CatchClause,
): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false
  }
  const root = receiverRoot(node.expression.expression)
  if (root === 'console' || /syncLogger/i.test(root)) {
    return true
  }
  const errorNames = enclosingCatchVariables(node, boundary)
  return node.arguments.some((argument) => referencesIdentifier(argument, errorNames))
}

function enclosingFunctionName(node: ts.Node): string | undefined {
  let current = node.parent
  while (current !== undefined) {
    if (ts.isFunctionDeclaration(current) && current.name !== undefined) {
      return current.name.text
    }
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current))
      && ts.isVariableDeclaration(current.parent)
      && ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text
    }
    current = current.parent
  }
  return undefined
}

function centrallyWrappedCalls(source: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  function visit(node: ts.Node): void {
    if (
      ts.isTryStatement(node)
      && node.catchClause !== undefined
      && descendants(node.catchClause, isCentralDelegation).length > 0
    ) {
      function collectCalls(candidate: ts.Node): void {
        if (ts.isCallExpression(candidate) && ts.isIdentifier(candidate.expression)) {
          names.add(candidate.expression.text)
        }
        ts.forEachChild(candidate, collectCalls)
      }
      collectCalls(node.tryBlock)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return names
}

function findFatalLocalLogs(sourceText: string, file: string): FatalLocalLog[] {
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true)
  const matches: FatalLocalLog[] = []
  const wrappedCalls = centrallyWrappedCalls(source)

  function visit(node: ts.Node): void {
    if (ts.isCatchClause(node)) {
      const directDelegations = descendants(node, isCentralDelegation)
      const functionName = enclosingFunctionName(node)
      const propagatedThrows = functionName !== undefined && wrappedCalls.has(functionName)
        ? descendants(node, ts.isThrowStatement)
        : []
      const delegations = [...directDelegations, ...propagatedThrows]
      const directLocalLogs = descendants(node, isLocalLoggerCall)
      const nestedLocalLogs = nestedCatchClauses(node).flatMap((nestedCatch) =>
        descendants(nestedCatch, isLocalLoggerCall).filter(
          (localLog) => ts.isCallExpression(localLog)
            && isUnsafeNestedCompensationLog(localLog, node),
        ),
      )
      const localLogs = [...directLocalLogs, ...nestedLocalLogs]
      for (const localLog of localLogs) {
        if (!ts.isCallExpression(localLog)) {
          continue
        }
        const isBeforeDelegation = delegations.some(
          (delegation) => localLog.getStart(source) < delegation.getStart(source),
        )
        if (isBeforeDelegation) {
          matches.push({
            file,
            line: source.getLineAndCharacterOfPosition(localLog.getStart(source)).line + 1,
            text: localLog.getText(source),
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(source)
  return matches
}

function workspaceInventory(): FatalLocalLog[] {
  const root = path.resolve(process.cwd(), 'src')
  return collectTypeScriptFiles(root)
    .sort()
    .flatMap((absolute) => {
      const file = path.relative(process.cwd(), absolute).split('\\').join('/')
      return findFatalLocalLogs(fs.readFileSync(absolute, 'utf8'), file)
    })
}

describe('fatal local logging ratchet', () => {
  test('keeps log-before-next catches at the exact ceiling of zero', () => {
    expect(workspaceInventory()).toEqual([])
  })

  test('fails closed on mutation and accepts the restored source', () => {
    const file = 'src/controllers/syncUtilizadoresControllers/syncReports.controller.ts'
    const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
    const marker = "next(internalError('Erro ao buscar reports', 'SYNC_REPORT_LIST_FAILED', error))"
    const mutation = source.replace(marker, `console.error(error)\n    ${marker}`)

    expect(mutation).not.toBe(source)
    expect(findFatalLocalLogs(mutation, file)).toEqual([
      expect.objectContaining({ file, text: 'console.error(error)' }),
    ])
    expect(findFatalLocalLogs(source, file)).toEqual([])

    const nestedMutation = source.replace(
      marker,
      `try {\n      throw error\n    } catch {\n      console.error(error)\n    }\n    ${marker}`,
    )

    expect(nestedMutation).not.toBe(source)
    expect(findFatalLocalLogs(nestedMutation, file)).toEqual([
      expect.objectContaining({ file, text: 'console.error(error)' }),
    ])
    expect(findFatalLocalLogs(source, file)).toEqual([])

    const nestedSyncLoggerMutation = nestedMutation.replace(
      'console.error(error)',
      "SyncLogger.error('compensation failed')",
    )
    expect(findFatalLocalLogs(nestedSyncLoggerMutation, file)).toEqual([
      expect.objectContaining({ file, text: "SyncLogger.error('compensation failed')" }),
    ])

    const nestedRawErrorMutation = nestedMutation.replace(
      'console.error(error)',
      "logger.warn('compensation failed', { error })",
    )
    expect(findFatalLocalLogs(nestedRawErrorMutation, file)).toEqual([
      expect.objectContaining({ file, text: "logger.warn('compensation failed', { error })" }),
    ])

    const nestedSafeLoggerMutation = nestedMutation.replace(
      'console.error(error)',
      "logger.warn('compensation failed', { stage: 'write', status: 'failed' })",
    )
    expect(findFatalLocalLogs(nestedSafeLoggerMutation, file)).toEqual([])

    const helperFile = 'src/controllers/syncUtilizadoresControllers/curseduca/dashboard.controller.ts'
    const helperSource = fs.readFileSync(path.resolve(process.cwd(), helperFile), 'utf8')
    const helperStart = 'export const getCurseducaDashboardStats = async () => {'
    const helperEnd = String.fromCharCode(10) + '}' + String.fromCharCode(10) + String.fromCharCode(10) + '//'
    const helperMutation = helperSource
      .replace(helperStart, helperStart + String.fromCharCode(10) + '  try {')
      .replace(
        helperEnd,
        String.fromCharCode(10)
          + '  } catch (error: unknown) {'
          + String.fromCharCode(10)
          + '    console.error(error)'
          + String.fromCharCode(10)
          + '    throw error'
          + String.fromCharCode(10)
          + '  }'
          + helperEnd,
      )

    expect(helperMutation).not.toBe(helperSource)
    expect(findFatalLocalLogs(helperMutation, helperFile)).toEqual([
      expect.objectContaining({ file: helperFile, text: 'console.error(error)' }),
    ])
    expect(findFatalLocalLogs(helperSource, helperFile)).toEqual([])
  })
})
