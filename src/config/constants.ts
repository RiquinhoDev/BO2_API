// src/config/constants.ts - Constantes da aplicação
export const USER_ROLES = {
    STUDENT: 'STUDENT',
    FREE_STUDENT: 'FREE_STUDENT',
    OWNER: 'OWNER',
    ADMIN: 'ADMIN',
    CONTENT_EDITOR: 'CONTENT_EDITOR',
    MODERATOR: 'MODERATOR'
  } as const
  
  export const USER_STATUS = {
    ACTIVE: 'ACTIVE',
    BLOCKED: 'BLOCKED',
    BLOCKED_BY_OWNER: 'BLOCKED_BY_OWNER',
    OVERDUE: 'OVERDUE'
  } as const
  
  export const USER_TYPES = {
    BUYER: 'BUYER',
    IMPORTED: 'IMPORTED',
    FREE: 'FREE',
    OWNER: 'OWNER',
    GUEST: 'GUEST'
  } as const
  
  export const USER_ENGAGEMENT = {
    NONE: 'NONE',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    VERY_HIGH: 'VERY_HIGH'
  } as const
  
  export const USER_PRIORITY = {
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH'
  } as const
  
  export const USER_SOURCE = {
    HOTMART: 'HOTMART',
    CSV: 'CSV',
    MANUAL: 'MANUAL',
    IMPORT: 'IMPORT'
  } as const
  
  export const CLASS_LEVELS = {
    BEGINNER: 'BEGINNER',
    INTERMEDIATE: 'INTERMEDIATE',
    ADVANCED: 'ADVANCED'
  } as const
  
  export const CLASS_SOURCES = {
    HOTMART_SYNC: 'hotmart_sync',
    MANUAL: 'manual',
    IMPORT: 'import'
  } as const
  
  // Validações
  export const VALIDATION_RULES = {
    DISCORD_ID_REGEX: /^\d{17,19}$/,
    EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    MIN_NAME_LENGTH: 2,
    MAX_REASON_LENGTH: 500,
    MAX_NOTES_LENGTH: 1000
  }
  
  // Limites de paginação
  export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 100,
    MIN_LIMIT: 1
  }
  
  
  
  
  
  
  
  
  
 
  
  
  