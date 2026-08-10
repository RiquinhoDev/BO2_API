import mongoose from 'mongoose'
import { Testimonial } from '../../models/Testimonial'

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

export function queryString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function ensureTestimonialModel() {
  if (!Testimonial || !mongoose.models.Testimonial) {
    throw new Error('Modelo Testimonial não está disponível')
  }
  return Testimonial
}