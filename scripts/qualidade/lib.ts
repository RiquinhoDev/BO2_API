import mongoose from 'mongoose'

export async function ligar(): Promise<typeof mongoose.connection.db> {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI é obrigatório')
  await mongoose.connect(process.env.MONGO_URI)
  return mongoose.connection.db
}

export async function desligar(): Promise<void> {
  await mongoose.disconnect()
}

export function turmaActual(user: any): string | null {
  const turmas = user?.hotmart?.enrolledClasses ?? []
  const activas = turmas.filter((t: any) => t?.className && t.isActive !== false)
  return (activas.at(-1) ?? turmas.filter((t: any) => t?.className).at(-1))?.className ?? null
}

export function ramoDaTurma(nome: string | null): 'base' | 'renovação' | 'sem turma' {
  if (!nome) return 'sem turma'
  return /renov|renova[cç][aã]o/i.test(nome) ? 'renovação' : 'base'
}

export async function activosOgi(db: any): Promise<{
  productId: any
  userProducts: any[]
  users: any[]
  timelines: any[]
}> {
  const product = await db.collection('products').findOne({
    platform: 'hotmart',
    isActive: true,
    $or: [{ code: /^OGI/i }, { courseCode: /^OGI/i }, { name: /Grande Investimento/i }]
  }, { projection: { _id: 1 } })
  if (!product) throw new Error('Produto OGI activo não encontrado')

  const userProducts = await db.collection('userproducts').find({
    platform: 'hotmart', productId: product._id, status: 'ACTIVE'
  }).project({ userId: 1 }).toArray()
  const ids = userProducts.map((x: any) => x.userId)
  const users = await db.collection('users').find({ _id: { $in: ids } }).toArray()
  const timelines = await db.collection('studentrenewaltimelines').find({ userId: { $in: ids } }).toArray()
  return { productId: product._id, userProducts, users, timelines }
}

export function mapaPorId(rows: any[]): Map<string, any> {
  return new Map(rows.map((row) => [String(row.userId ?? row._id), row]))
}

export function diasEntre(inicio: Date, fim: Date): number {
  return (new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000
}

export function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object' || value instanceof Date) return value
  return Object.fromEntries(Object.keys(value).sort().filter((k) => k !== 'geradoEm' && k !== 'updatedAt').map((k) => [k, canonical(value[k])]))
}
