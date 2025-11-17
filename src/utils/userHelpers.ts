import { VALIDATION_RULES } from "../config/constants";
import user from "../models/user";

// src/utils/userHelpers.ts - Utilitários para usuários
  export class UserHelper {
    static validateDiscordIds(discordIds: string[]): { valid: boolean; errors: string[] } {
      const errors: string[] = []
      const unique = new Set()
  
      for (const id of discordIds) {
        if (!VALIDATION_RULES.DISCORD_ID_REGEX.test(id)) {
          errors.push(`Discord ID inválido: ${id}. Deve ter entre 17-19 dígitos.`)
        }
        if (unique.has(id)) {
          errors.push(`Discord ID duplicado: ${id}`)
        }
        unique.add(id)
      }
  
      return {
        valid: errors.length === 0,
        errors
      }
    }
  
    static validateEmail(email: string): boolean {
      return VALIDATION_RULES.EMAIL_REGEX.test(email)
    }
  
    static calculateDaysSince(date: Date | string | null | undefined): number | null {
      if (!date) return null
      const dateObj = new Date(date)
      if (isNaN(dateObj.getTime())) return null
      return Math.floor((Date.now() - dateObj.getTime()) / (1000 * 60 * 60 * 24))
    }
  
    static getStudentValidationStatus(student: any) {
      return {
        email: !!student.email && this.validateEmail(student.email),
        discordIds: Array.isArray(student.discordIds) && 
                    student.discordIds.every((id: string) => VALIDATION_RULES.DISCORD_ID_REGEX.test(id)),
        name: !!student.name && student.name.trim().length >= VALIDATION_RULES.MIN_NAME_LENGTH
      }
    }
  
    static async checkEmailUnique(email: string, excludeId?: string) {
      const query: any = { email }
      if (excludeId) {
        query._id = { $ne: excludeId }
      }
      const existing = await user.findOne(query)
      return !existing
    }
  }