import { z } from 'zod'

export const ClarezaAssetKindSchema = z.enum(['stock', 'fund', 'crypto'])
export const ClarezaAssetTypeSchema = z.enum(['growth', 'value', 'reit', 'etf', 'cripto'])
export const ClarezaAssetBucketSchema = z.enum([
  'growth',
  'value',
  'reit',
  'financials',
  'etf',
  'cripto',
])

export const ClarezaAssetSchema = z.object({
  ticker: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9.-]{0,24}$/),
  name: z.string().min(1),
  kind: ClarezaAssetKindSchema,
  type: ClarezaAssetTypeSchema,
  bucket: ClarezaAssetBucketSchema,
  sector: z.string().min(1),
}).strict().superRefine((asset, context) => {
  if (asset.kind === 'fund' && (asset.type !== 'etf' || asset.bucket !== 'etf')) {
    context.addIssue({ code: 'custom', message: 'Fund assets require ETF type and bucket' })
  }
  if (asset.kind === 'crypto' && (asset.type !== 'cripto' || asset.bucket !== 'cripto')) {
    context.addIssue({ code: 'custom', message: 'Crypto assets require cripto type and bucket' })
  }
  if (asset.kind === 'stock' && (asset.type === 'etf' || asset.type === 'cripto')) {
    context.addIssue({ code: 'custom', message: 'Stock assets cannot use fund or crypto types' })
  }
  if (asset.type === 'reit' && (asset.kind !== 'stock' || asset.bucket !== 'reit')) {
    context.addIssue({ code: 'custom', message: 'REIT assets require stock kind and REIT bucket' })
  }
})

export const ClarezaUniverseSchema = z.array(ClarezaAssetSchema)

export type ClarezaAsset = z.infer<typeof ClarezaAssetSchema>

export interface ClarezaEditorialResolution {
  readonly assets: readonly ClarezaAsset[]
  readonly missing: readonly string[]
}
