import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const generator = path.join(process.cwd(), 'scripts', 'generate-response-contract-catalog.mjs')
const routeCatalogPath = path.join(process.cwd(), 'src', 'security', 'route-catalog.json')
const responseCatalogPath = path.join(process.cwd(), 'src', 'contracts', 'response-contract-catalog.json')
const sourcePath = path.join(process.cwd(), 'src', 'services', 'users', 'usersV2OverviewAnalytics.service.ts')
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')
const fileSha = (filePath: string): string => sha256(fs.readFileSync(filePath, 'utf8'))

function workspaceShas() {
  return {
    route: fileSha(routeCatalogPath),
    response: fileSha(responseCatalogPath),
    source: fileSha(sourcePath),
  }
}

function expectWorkspaceShas(expected: ReturnType<typeof workspaceShas>): void {
  expect(workspaceShas()).toEqual(expected)
}

function runChecker(
  extraEnv: NodeJS.ProcessEnv = {},
  preserveInheritedOverlayEnv = false,
) {
  const env = { ...process.env }
  if (!preserveInheritedOverlayEnv) {
    delete env.RESPONSE_CONTRACT_SOURCE_OVERLAY
    delete env.RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY
    delete env.RESPONSE_CONTRACT_ALLOW_TEST_OVERLAY
  }
  Object.assign(env, extraEnv)
  return spawnSync(process.execPath, [generator, '--check'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  })
}

function createOverlayRoot(directory: string): string {
  const overlayRoot = path.join(directory, 'source-overlay')
  fs.mkdirSync(overlayRoot, { recursive: true })
  return overlayRoot
}

function writeOverlayEntry(overlayRoot: string, targetPath: string, contents: string): string {
  const entry = path.join(
    overlayRoot,
    'backend',
    path.relative(process.cwd(), targetPath),
  )
  fs.mkdirSync(path.dirname(entry), { recursive: true })
  fs.writeFileSync(entry, contents, 'utf8')
  return entry
}

const testOverlayEnv = (overlayRoot: string): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  RESPONSE_CONTRACT_ALLOW_TEST_OVERLAY: '1',
  RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: overlayRoot,
})

function detectSymlinkSupport(): { available: boolean; reason: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-symlink-'))
  const target = path.join(directory, 'target')
  const link = path.join(directory, 'link')
  try {
    fs.mkdirSync(target)
    fs.symlinkSync(target, link, 'junction')
    return { available: true, reason: '' }
  } catch (error) {
    const code = error instanceof Error && 'code' in error
      ? String(error.code)
      : 'UNKNOWN'
    if (process.platform === 'win32' && ['EACCES', 'EPERM', 'UNKNOWN'].includes(code)) {
      return { available: false, reason: code }
    }
    throw error
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

const symlinkSupport = detectSymlinkSupport()
const symlinkBoundaryTest = symlinkSupport.available ? test : test.skip

describe('response contract test source overlay boundary', () => {
  test('rejects a legacy generic overlay inherited by a normal check', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-overlay-'))
    const shas = workspaceShas()
    const previous = process.env.RESPONSE_CONTRACT_SOURCE_OVERLAY

    try {
      process.env.RESPONSE_CONTRACT_SOURCE_OVERLAY = directory
      const result = runChecker({}, true)

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain(
        'RESPONSE_CONTRACT_SOURCE_OVERLAY: legacy generic overlays are forbidden',
      )
    } finally {
      if (previous === undefined) delete process.env.RESPONSE_CONTRACT_SOURCE_OVERLAY
      else process.env.RESPONSE_CONTRACT_SOURCE_OVERLAY = previous
      fs.rmSync(directory, { recursive: true, force: true })
      expectWorkspaceShas(shas)
    }
  })

  test.each([
    [
      'outside test mode',
      { NODE_ENV: 'production', RESPONSE_CONTRACT_ALLOW_TEST_OVERLAY: '1' },
      'RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY requires NODE_ENV=test',
    ],
    [
      'without explicit opt-in',
      { NODE_ENV: 'test' },
      'RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY requires RESPONSE_CONTRACT_ALLOW_TEST_OVERLAY=1',
    ],
  ])('rejects a test overlay %s', (_label, environment, expectedError) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-overlay-'))
    const overlayRoot = createOverlayRoot(directory)
    const shas = workspaceShas()

    try {
      const result = runChecker({
        ...environment,
        RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: overlayRoot,
      })

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain(expectedError)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expectWorkspaceShas(shas)
    }
  })

  test('rejects a dangling overlay opt-in without a test root', () => {
    const shas = workspaceShas()
    const result = runChecker({
      NODE_ENV: 'test',
      RESPONSE_CONTRACT_ALLOW_TEST_OVERLAY: '1',
    })

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain(
      'RESPONSE_CONTRACT_ALLOW_TEST_OVERLAY requires RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY',
    )
    expectWorkspaceShas(shas)
  })
  test('rejects an overlay root outside the OS temp directory', () => {
    const shas = workspaceShas()
    const result = runChecker(testOverlayEnv(process.cwd()))

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain(
      'RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: root must be contained in the OS temp directory',
    )
    expectWorkspaceShas(shas)
  })

  test('rejects traversal segments in the overlay root', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-overlay-'))
    const overlayRoot = createOverlayRoot(directory)
    const traversingRoot = `${overlayRoot}${path.sep}nested${path.sep}..`
    const shas = workspaceShas()

    try {
      const result = runChecker(testOverlayEnv(traversingRoot))

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain(
        'RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: traversal segments are forbidden',
      )
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expectWorkspaceShas(shas)
    }
  })

  symlinkBoundaryTest(
    `rejects a symlink overlay root${symlinkSupport.available
      ? ''
      : ` (Windows privilege unavailable: ${symlinkSupport.reason})`}`,
    () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-overlay-'))
      const target = path.join(directory, 'target')
      const overlayRoot = path.join(directory, 'source-overlay-link')
      const shas = workspaceShas()

      try {
        fs.mkdirSync(target)
        fs.symlinkSync(target, overlayRoot, 'junction')
        const result = runChecker(testOverlayEnv(overlayRoot))

        expect(result.status).not.toBe(0)
        expect(`${result.stdout}${result.stderr}`).toContain(
          'RESPONSE_CONTRACT_TEST_SOURCE_OVERLAY: root cannot be a symbolic link',
        )
      } finally {
        fs.rmSync(directory, { recursive: true, force: true })
        expectWorkspaceShas(shas)
      }
    },
  )
  symlinkBoundaryTest(
    `rejects a symlink entry in the overlay tree${symlinkSupport.available
      ? ''
      : ` (Windows privilege unavailable: ${symlinkSupport.reason})`}`,
    () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-overlay-'))
      const overlayRoot = createOverlayRoot(directory)
      const target = path.join(directory, 'target')
      const entry = path.join(overlayRoot, 'backend', 'src', 'linked')
      const shas = workspaceShas()

      try {
        fs.mkdirSync(path.dirname(entry), { recursive: true })
        fs.mkdirSync(target)
        fs.symlinkSync(target, entry, 'junction')
        const result = runChecker(testOverlayEnv(overlayRoot))

        expect(result.status).not.toBe(0)
        expect(`${result.stdout}${result.stderr}`).toContain(
          'backend/src/linked: symbolic links are forbidden',
        )
      } finally {
        fs.rmSync(directory, { recursive: true, force: true })
        expectWorkspaceShas(shas)
      }
    },
  )
  test('rejects an overlay entry with an unknown target root', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-overlay-'))
    const overlayRoot = createOverlayRoot(directory)
    const entry = path.join(overlayRoot, 'other', 'src', 'fixture.ts')
    const shas = workspaceShas()

    try {
      fs.mkdirSync(path.dirname(entry), { recursive: true })
      fs.writeFileSync(entry, 'export {}\n', 'utf8')
      const result = runChecker(testOverlayEnv(overlayRoot))

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain(
        'other/src/fixture.ts: target root must be backend or front',
      )
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expectWorkspaceShas(shas)
    }
  })
  test('rejects a non-TypeScript overlay entry', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-overlay-'))
    const overlayRoot = createOverlayRoot(directory)
    const entry = path.join(overlayRoot, 'backend', 'src', 'fixture.txt')
    const shas = workspaceShas()

    try {
      fs.mkdirSync(path.dirname(entry), { recursive: true })
      fs.writeFileSync(entry, 'not TypeScript\n', 'utf8')
      const result = runChecker(testOverlayEnv(overlayRoot))

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain(
        'backend/src/fixture.txt: only .ts/.tsx files are allowed',
      )
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expectWorkspaceShas(shas)
    }
  })

  test('rejects an overlay entry without an existing source target', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-overlay-'))
    const overlayRoot = createOverlayRoot(directory)
    const entry = path.join(overlayRoot, 'backend', 'src', '__missing.ts')
    const shas = workspaceShas()

    try {
      fs.mkdirSync(path.dirname(entry), { recursive: true })
      fs.writeFileSync(entry, 'export {}\n', 'utf8')
      const result = runChecker(testOverlayEnv(overlayRoot))

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain(
        'backend/src/__missing.ts: target source does not exist',
      )
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expectWorkspaceShas(shas)
    }
  })

  test('applies a valid test-only overlay without changing source or catalogs', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'response-contract-overlay-'))
    const overlayRoot = createOverlayRoot(directory)
    const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n')
    const mutated = source.replace(
      '    return {\n      success: true,\n      data: {',
      '    return {\n      success: true,\n      overlayProbe: null,\n      data: {',
    )
    const shas = workspaceShas()
    expect(mutated).not.toBe(source)

    try {
      const entry = writeOverlayEntry(overlayRoot, sourcePath, mutated)
      const entrySha = fileSha(entry)
      const result = runChecker(testOverlayEnv(overlayRoot))

      expect(result.status).not.toBe(0)
      expect(`${result.stdout}${result.stderr}`).toContain('GET /api/users/v2/analytics')
      expect(fileSha(entry)).toBe(entrySha)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
      expectWorkspaceShas(shas)
    }
  })
})
