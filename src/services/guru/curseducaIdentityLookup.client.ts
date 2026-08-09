import { lookupCurseducaUserIdByEmail } from './guru.constants'

export interface CurseducaIdentity {
  curseducaUserId: string
  situation: string
  name?: string
}

export interface CurseducaIdentityLookup {
  findByEmail(email: string): Promise<CurseducaIdentity | undefined>
}

export const curseducaIdentityLookup: CurseducaIdentityLookup = {
  async findByEmail(email) {
    return (await lookupCurseducaUserIdByEmail(email)) ?? undefined
  },
}