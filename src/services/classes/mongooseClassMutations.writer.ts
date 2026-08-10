// Mongoose writer for the classMutations vertical. Every Class/User write behind
// POST /addOrEditClass and DELETE /:classId lives here; the methods are migrated
// verbatim from the retired ClassesService (addOrEditClass/getClassById/deleteClass).
import { Class, validateClassId, normalizeClassName } from '../../models/Class'
import User from '../../models/user'
import type {
  ClassInput,
  ClassMutationsWriter,
  ClassSummary,
  UpsertResult,
} from './classMutations.service'

export class MongooseClassMutationsWriter implements ClassMutationsWriter {
  async upsert(input: ClassInput): Promise<UpsertResult> {
    const { classId, name, description, isActive = true, estado, source = 'manual' } = input

    if (!validateClassId(classId)) {
      throw new Error('ID da turma inválido. Use apenas letras, números, hífens e underscores.')
    }

    const normalizedName = normalizeClassName(name)
    if (normalizedName.length < 3) {
      throw new Error('Nome da turma deve ter pelo menos 3 caracteres.')
    }

    // Estado has priority over the isActive boolean; both stay consistent.
    const finalEstado = estado ?? (isActive ? 'ativo' : 'inativo')
    const finalIsActive = estado ? estado === 'ativo' : isActive

    let existingClass = await Class.findOne({ classId })
    let isNew = false

    if (existingClass) {
      // Update in place WITHOUT touching source: source is fixed at creation so
      // the class keeps its student association (CursEduca vs Hotmart).
      existingClass.name = normalizedName
      if (description !== undefined) existingClass.description = description
      existingClass.isActive = finalIsActive
      existingClass.estado = finalEstado
      await existingClass.save()
    } else {
      existingClass = new Class({
        classId,
        name: normalizedName,
        description,
        isActive: finalIsActive,
        estado: finalEstado,
        source,
        studentCount: 0,
      })
      await existingClass.save()
      isNew = true
    }

    return { class: existingClass, isNew }
  }

  async classSummary(classId: string): Promise<ClassSummary | null> {
    const cls = await Class.findOne({ classId }).lean()
    if (!cls) return null

    // Source-aware active-student count (CursEduca counts by group UUID).
    const studentCount = cls.source === 'curseduca_sync' && cls.curseducaUuid
      ? await User.countDocuments({
        'curseduca.groupCurseducaUuid': cls.curseducaUuid,
        'combined.status': 'ACTIVE',
      })
      : await User.countDocuments({
        classId: cls.classId,
        status: 'ACTIVE',
      })

    return { ...cls, studentCount }
  }

  async remove(classId: string): Promise<void> {
    const cls = await Class.findOne({ classId })
    if (!cls) {
      throw new Error('Turma não encontrada')
    }

    // classId-based guard (distinct from classSummary's source-aware pre-check).
    const studentCount = await User.countDocuments({
      classId,
      status: 'ACTIVE',
    })

    if (studentCount > 0) {
      throw new Error(`Não é possível remover turma com ${studentCount} estudante(s) ativo(s)`)
    }

    await Class.deleteOne({ classId })
  }
}
