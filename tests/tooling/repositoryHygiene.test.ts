import fs from 'fs'
import path from 'path'

import packageJson from '../../package.json'

const repositoryRoot = path.resolve(__dirname, '../..')
const documentationIndexPath = path.join(repositoryRoot, 'docs', 'README.md')

const expectedDocuments = {
  'docs/archive/API_AUDIT_2026-07-15.md': 'ARCHIVE',
  'docs/archive/NATIVE_TAG_SECURITY_AUDIT_2026-01-23.md': 'ARCHIVE',
  'docs/reference/NATIVE_TAG_PROTECTION_SUMMARY.md': 'REFERENCE',
  'docs/reference/renewal/RENOVACAO_CONTEXTO_IA.md': 'REFERENCE',
  'docs/reference/renewal/RENOVACAO_DISCORD_CARGOS_PLAN.md': 'REFERENCE',
  'docs/reference/renewal/RENOVACAO_OGI_BO_PLAN.md': 'REFERENCE',
  'docs/active/URGENT_KEY_REPLACEMENT.md': 'ACTIVE',
} as const

const indexedDocuments = ['docs/README.md', ...Object.keys(expectedDocuments)]

const listRootMarkdown = (): string[] =>
  fs
    .readdirSync(repositoryRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort()

const indexedStatuses = (): Map<string, string> => {
  const index = fs.readFileSync(documentationIndexPath, 'utf8')
  const statuses = new Map<string, string>()
  let currentStatus = ''

  for (const line of index.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      const normalizedHeading = heading[1].toUpperCase()
      currentStatus = ['ACTIVE', 'REFERENCE', 'ARCHIVE'].find(status =>
        normalizedHeading.includes(status),
      ) ?? ''
    }

    const link = line.match(/\[[^\]]+\]\(([^)]+)\)/)
    if (!link || !currentStatus) continue

    const target = link[1].split('#', 1)[0]
    if (!target.endsWith('.md')) continue

    const absoluteTarget = path.resolve(path.dirname(documentationIndexPath), target)
    const relativeTarget = path.relative(repositoryRoot, absoluteTarget).replace(/\\/g, '/')
    statuses.set(relativeTarget, currentStatus)
  }

  return statuses
}

const missingRelativeDocumentationLinks = (): string[] => {
  const missing: string[] = []

  for (const relativeFile of indexedDocuments) {
    const absoluteFile = path.join(repositoryRoot, relativeFile)
    const source = fs.readFileSync(absoluteFile, 'utf8')

    for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split('#', 1)[0].trim()
      if (
        !target ||
        /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(target) ||
        !/\.(?:md|json)$/i.test(target)
      ) {
        continue
      }

      const absoluteTarget = path.resolve(path.dirname(absoluteFile), target)
      if (!fs.existsSync(absoluteTarget)) missing.push(`${relativeFile}: ${target}`)
    }
  }

  return missing.sort()
}

describe('repository documentation hygiene', () => {
  it('keeps Markdown out of the repository root', () => {
    expect(listRootMarkdown()).toEqual([])
  })

  it('keeps every classified document at its indexed destination', () => {
    for (const relativePath of Object.keys(expectedDocuments)) {
      expect(fs.existsSync(path.join(repositoryRoot, relativePath))).toBe(true)
    }

    const statuses = indexedStatuses()
    for (const [relativePath, expectedStatus] of Object.entries(expectedDocuments)) {
      expect(statuses.get(relativePath)).toBe(expectedStatus)
    }
  })

  it('keeps relative Markdown and data links in the index and moved documents resolvable', () => {
    expect(missingRelativeDocumentationLinks()).toEqual([])
  })

  it('retains the package metadata contract', () => {
    expect(packageJson).toMatchObject({
      name: 'bo2-api',
      main: 'dist/index.js',
      private: true,
    })
  })
})
