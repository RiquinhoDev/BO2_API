import type { IClassEnrollment } from '../../models/UserProduct'

interface ClassEnrollmentRolePlan {
  role?: string
  update?: {
    path: string
    value: string
  }
}

export function planClassEnrollmentRole(
  classes: IClassEnrollment[],
  classId: string,
  sourceRole?: string | null
): ClassEnrollmentRolePlan {
  if (!sourceRole) {
    return {}
  }

  const classIndex = classes.findIndex((enrollment) => enrollment.classId === classId)
  if (classIndex === -1 || classes[classIndex].role === sourceRole) {
    return { role: sourceRole }
  }

  return {
    role: sourceRole,
    update: {
      path: `classes.${classIndex}.role`,
      value: sourceRole
    }
  }
}
