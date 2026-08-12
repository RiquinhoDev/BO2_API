import fs from 'node:fs'

test('plans expose anomaly as a canonical discriminated outcome', () => {
  for (const path of ['src/routes/discordRenewal.routes.ts','src/routes/renewalAc.routes.ts']) {
    const source=fs.readFileSync(path,'utf8')
    expect(source).toContain("const outcome = report.anomalyAborted ? 'anomaly-aborted' : 'planned'")
    expect(source).toContain('res.json(successResponse({ outcome, report }))')
    expect(source).not.toContain('success: !report.anomalyAborted')
  }
})