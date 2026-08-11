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
      const localLogs = descendants(node, isLocalLoggerCall)
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
