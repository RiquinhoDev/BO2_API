const {
  buildTypeScriptSnapshot,
  evaluateTypeScriptRatchet,
  generateTypeScriptBaseline,
} = require('../../scripts/typecheck-ratchet')

const diagnostic = (file: string, code: number, line = 1) =>
  `${file}(${line},1): error TS${code}: exemplo`

describe('TypeScript ratchet', () => {
  test('aceita exatamente o baseline registado', () => {
    const current = buildTypeScriptSnapshot([
      diagnostic('src/controllers/a.ts', 2322),
      diagnostic('src/services/b.ts', 2339),
    ].join('\n'))

    expect(evaluateTypeScriptRatchet(current, {
      version: 1,
      directories: { controllers: 1, services: 1 },
      dirtyFiles: ['src/controllers/a.ts', 'src/services/b.ts'],
    })).toEqual([])
  })

  test('aceita redução de erros e ficheiros sujos', () => {
    const current = buildTypeScriptSnapshot(
      diagnostic('src/controllers/a.ts', 2322),
    )

    expect(evaluateTypeScriptRatchet(current, {
      version: 1,
      directories: { controllers: 2, services: 1 },
      dirtyFiles: [
        'src/controllers/a.ts',
        'src/controllers/old.ts',
        'src/services/b.ts',
      ],
    })).toEqual([])
  })

  test('rejeita aumento dentro de um diretório conhecido', () => {
    const current = buildTypeScriptSnapshot([
      diagnostic('src/controllers/a.ts', 2322),
      diagnostic('src/controllers/a.ts', 2339, 2),
    ].join('\n'))

    expect(evaluateTypeScriptRatchet(current, {
      version: 1,
      directories: { controllers: 1 },
      dirtyFiles: ['src/controllers/a.ts'],
    })).toContain('controllers: 2 erros excedem o baseline 1')
  })

  test('rejeita erro num ficheiro fora da lista suja', () => {
    const current = buildTypeScriptSnapshot(
      diagnostic('src/controllers/novo.ts', 2322),
    )

    expect(evaluateTypeScriptRatchet(current, {
      version: 1,
      directories: { controllers: 1 },
      dirtyFiles: ['src/controllers/antigo.ts'],
    })).toContain('ficheiro limpo ganhou erros: src/controllers/novo.ts')
  })

  test('rejeita grupo desconhecido', () => {
    const current = buildTypeScriptSnapshot(
      diagnostic('src/novo-modulo/a.ts', 2322),
    )

    expect(evaluateTypeScriptRatchet(current, {
      version: 1,
      directories: { controllers: 1 },
      dirtyFiles: ['src/controllers/a.ts'],
    })).toContain('grupo desconhecido: novo-modulo')
  })

  test('gera baseline ordenado a partir dos diagnósticos', () => {
    const current = buildTypeScriptSnapshot([
      diagnostic('src/services/z.ts', 2322),
      diagnostic('src/controllers/b.ts', 2339),
      diagnostic('src/controllers/a.ts', 2345),
    ].join('\n'))

    expect(generateTypeScriptBaseline(current)).toEqual({
      version: 1,
      directories: { controllers: 2, services: 1 },
      dirtyFiles: [
        'src/controllers/a.ts',
        'src/controllers/b.ts',
        'src/services/z.ts',
      ],
    })
  })
})
