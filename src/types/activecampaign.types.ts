// ════════════════════════════════════════════════════════════
// 📁 src/types/activecampaign.types.ts
// Types do Active Campaign
// ════════════════════════════════════════════════════════════

export interface ACContact {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  fieldValues?: ACFieldValue[]
}

export interface ACFieldValue {
  field: string
  value: string
}

export interface ACTag {
  tag: string
  contactId: string
}

export interface ACContactResponse {
  contact: {
    id: string
    email: string
    firstName: string
    lastName: string
    cdate: string
    udate: string
  }
}
export type ACContactApi = ACContactResponse['contact']

export interface ACTagResponse {
  contactTag: {
    id: string
    contact: string
    tag: string
    cdate: string
  }
}

export interface ACListResponse {
  lists: Array<{
    id: string
    name: string
    cdate: string
  }>
}

export interface ACWebhookPayload {
  type: string
  date_time: string
  initiated_from: string
  initiated_by: string
  contact: {
    id: string
    email: string
  }
  campaign?: {
    id: string
    name: string
  }
  message?: {
    id: string
  }
}

