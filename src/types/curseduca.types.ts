// 🆕 ATUALIZAR interfaces existentes

export interface CurseducaGroup {
  id: string            // ID numérico
  uuid: string          // UUID
  name: string
  description?: string
  membersCount?: number // 🆕 Adicionar
  createdAt: string
  updatedAt?: string
}

export interface CurseducaMember {
  uuid: string
  id: string
  name: string
  email: string
  status?: string
  groups?: string[]     // 🆕 Array de UUIDs dos grupos
  createdAt: string
  updatedAt?: string
  lastLogin?: string
  neverLogged?: boolean
  image?: string
}

