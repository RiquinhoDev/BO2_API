import type { ConsolidatedClass } from '../../types/studentComplete'
import type { StudentProductData } from './contracts'

export function consolidateClasses(products: StudentProductData[]): ConsolidatedClass[] {
  const classes: ConsolidatedClass[] = []
  const seen = new Set<string>()

  products.forEach((product) => {
    if (product.platform !== 'hotmart' && product.platform !== 'curseduca') return
    if (!Array.isArray(product.classes)) return

    const platform = product.platform
    product.classes.forEach((enrollment) => {
      const key = `${platform}:${enrollment.classId}`
      if (seen.has(key)) return

      seen.add(key)
      classes.push({
        classId: enrollment.classId,
        className: enrollment.className || `Turma ${enrollment.classId}`,
        platform,
        source: platform === 'hotmart' ? 'hotmart_sync' : 'curseduca_sync',
        isActive: product.status === 'ACTIVE',
        enrolledAt: enrollment.joinedAt || product.enrolledAt || null,
      })
    })
  })

  return classes
}
