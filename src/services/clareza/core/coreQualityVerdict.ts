export interface ScoreStyle {
  readonly label: string
  readonly color: string
  readonly className?: string
}

export interface CoreVerdict {
  readonly key: string
  readonly label: string
  readonly color: string
  readonly text: string
}

export function valuationStyle(score: number | null): ScoreStyle {
  if (score === null) return { label: 'SEM DADOS', color: 'rgba(255,255,255,0.35)', className: 'sem-dados' }
  if (score >= 80) return { label: 'MUITO BARATO', color: '#75F82C', className: 'muito-barato' }
  if (score >= 60) return { label: 'BARATO', color: '#86efac', className: 'barato' }
  if (score >= 40) return { label: 'NEUTRO', color: 'rgba(255,255,255,0.55)', className: 'neutro' }
  if (score >= 20) return { label: 'CARO', color: '#F97316', className: 'caro' }
  return { label: 'MUITO CARO', color: '#FF4D4D', className: 'muito-caro' }
}

export function qualityStyle(score: number | null): ScoreStyle {
  if (score === null) return { label: 'SEM DADOS', color: 'rgba(255,255,255,0.35)' }
  if (score >= 75) return { label: 'EXCELENTE', color: '#75F82C' }
  if (score >= 60) return { label: 'BOA', color: '#86efac' }
  if (score >= 42) return { label: 'RAZOÁVEL', color: 'rgba(255,255,255,0.55)' }
  if (score >= 28) return { label: 'FRACA', color: '#F97316' }
  return { label: 'MUITO FRACA', color: '#FF4D4D' }
}

const verdict = (key: string, label: string, color: string): CoreVerdict => ({
  key, label, color, text: label,
})

export function buildCoreVerdict(
  valuationScore: number | null,
  qualityScore: number | null,
  lowConfidence: boolean,
): CoreVerdict {
  const insufficient = 'Dados insuficientes para uma avaliação fiável.'
  if (valuationScore === null || qualityScore === null) {
    return verdict('indefinido', insufficient, 'rgba(255,255,255,0.45)')
  }
  if (lowConfidence) return verdict('poucos-dados', insufficient, 'rgba(255,255,255,0.45)')
  if (valuationScore >= 60) {
    if (qualityScore >= 75) return verdict('barata-excelente', 'Excelente negócio a um preço atrativo.', '#75F82C')
    if (qualityScore >= 60) return verdict('barata-boa', 'Bom negócio a um preço atrativo.', '#86efac')
    return verdict('barata-fraca', 'Preço atrativo, mas fundamentais fracos.', '#F97316')
  }
  if (qualityScore >= 75) return verdict('cara-excelente', 'Excelente negócio a um preço exigente.', '#D6E85A')
  if (qualityScore >= 60) return verdict('cara-boa', 'Bom negócio a um preço exigente.', '#D6E85A')
  return verdict('cara-fraca', 'Fundamentais fracos e preço exigente.', '#FF4D4D')
}
