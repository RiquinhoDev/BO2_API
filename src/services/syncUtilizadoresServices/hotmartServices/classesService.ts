// src/services/classesService.ts
import { Class, ClassHistory, IClass, ClassFilters, ClassStats } from '../../../models/Class'
import { validateClassId, normalizeClassName } from '../../../models/Class'
import User from '../../../models/User' // 🔧 CORRIGIDO: Usar modelo User em vez de Student

class ClassesService {
    async listClasses(filters: ClassFilters) {
        try {
          const {
            search,
            isActive,
            source,
            limit,
            offset,
            sortBy,
            sortOrder
          } = filters
      
          // Construir query
          const query: any = {}
          
          // ✅ CORRIGIDO: Só aplicar filtro isActive se for especificado
          if (isActive !== undefined) {
            query.isActive = isActive
          }
          
          if (source) {
            query.source = source
          }
          
          if (search) {
            query.$or = [
              { name: { $regex: search, $options: 'i' } },
              { classId: { $regex: search, $options: 'i' } },
              { description: { $regex: search, $options: 'i' } }
            ]
          }
      
          console.log('🔍 Query MongoDB:', JSON.stringify(query, null, 2)) // ✅ DEBUG
      
          // Configurar ordenação
          const sort: any = {}
          sort[sortBy] = sortOrder === 'desc' ? -1 : 1
      
          // ✅ ADICIONAR: Verificar total no banco ANTES de aplicar filtros
          const totalInDatabase = await Class.countDocuments({})
          console.log(`📊 Total de turmas no banco: ${totalInDatabase}`)
      
          // Executar consulta
          const [classes, total] = await Promise.all([
            Class.find(query)
              .sort(sort)
              .limit(limit)
              .skip(offset)
              .lean(),
            Class.countDocuments(query)
          ])
      
          console.log(`📊 Query retornou: ${classes.length} turmas de ${total} que atendem aos filtros`)
      
      // Adicionar contagem de estudantes para cada turma
      const classesWithStats = await Promise.all(
        classes.map(async (cls) => {
          let studentCount = 0
          
          // ✅ CORRIGIDO: Contar alunos baseado na fonte da turma
          if (cls.source === 'curseduca_sync' && cls.curseducaUuid) {
            // Para turmas CursEduca, contar por groupCurseducaUuid
            studentCount = await User.countDocuments({ 
              'curseduca.groupCurseducaUuid': cls.curseducaUuid,
              'combined.status': 'ACTIVE' 
            })
          } else {
            // Para turmas Hotmart e outras, contar por classId (comportamento original)
            studentCount = await User.countDocuments({
              classId: cls.classId,
              status: 'ACTIVE'
            })
          }
          
          return {
            ...cls,
            studentCount
          }
        })
      )
      
          return {
            classes: classesWithStats,
            total,
            totalInDatabase // ✅ ADICIONAR para debug
          }
        } catch (error) {
          console.error('❌ Erro no serviço listClasses:', error)
          throw error
        }
      }

  async addOrEditClass(classData: {
    classId: string
    name: string
    description?: string
    isActive?: boolean
    estado?: 'ativo' | 'inativo'
    source?: string
  }) {
    try {
      const { classId, name, description, isActive = true, estado, source = 'manual' } = classData

      // Validações
      if (!validateClassId(classId)) {
        throw new Error('ID da turma inválido. Use apenas letras, números, hífens e underscores.')
      }

      const normalizedName = normalizeClassName(name)
      if (normalizedName.length < 3) {
        throw new Error('Nome da turma deve ter pelo menos 3 caracteres.')
      }

      // 🆕 DETERMINAR ESTADO FINAL baseado em prioridade
      let finalEstado = estado
      let finalIsActive = isActive
      
      if (estado) {
        // Se estado foi fornecido, sincronizar isActive
        finalIsActive = estado === 'ativo'
      } else {
        // Se apenas isActive foi fornecido, determinar estado
        finalEstado = isActive ? 'ativo' : 'inativo'
      }

      // Verificar se já existe
      let existingClass = await Class.findOne({ classId })
      let isNew = false

      if (existingClass) {
        // ✅ CORRIGIDO: Atualizar turma existente SEM alterar o source
        existingClass.name = normalizedName
        if (description !== undefined) existingClass.description = description
        existingClass.isActive = finalIsActive
        existingClass.estado = finalEstado
        // ❌ REMOVIDO: NÃO sobrescrever source em edições
        // O source é definido na criação e não deve ser alterado depois
        // para evitar perder a associação com alunos (CursEduca vs Hotmart)
        
        await existingClass.save()
      } else {
        // Criar nova turma
        existingClass = new Class({
          classId,
          name: normalizedName,
          description,
          isActive: finalIsActive,
          estado: finalEstado,
          source,
          studentCount: 0
        })
        
        await existingClass.save()
        isNew = true
      }

      return {
        class: existingClass,
        isNew
      }
    } catch (error) {
      console.error('❌ Erro no serviço addOrEditClass:', error)
      throw error
    }
  }

  async getClassById(classId: string) {
    try {
      const cls = await Class.findOne({ classId }).lean()
      if (!cls) return null

      // ✅ CORRIGIDO: Contar alunos baseado na fonte da turma
      let studentCount = 0
      if (cls.source === 'curseduca_sync' && cls.curseducaUuid) {
        studentCount = await User.countDocuments({ 
          'curseduca.groupCurseducaUuid': cls.curseducaUuid,
          'combined.status': 'ACTIVE' 
        })
      } else {
        studentCount = await User.countDocuments({
          classId: cls.classId,
          status: 'ACTIVE'
        })
      }

      return {
        ...cls,
        studentCount
      }
    } catch (error) {
      console.error('❌ Erro no serviço getClassById:', error)
      throw error
    }
  }

  async deleteClass(classId: string) {
    try {
      const cls = await Class.findOne({ classId })
      if (!cls) {
        throw new Error('Turma não encontrada')
      }

      // Verificar se tem estudantes
      const studentCount = await User.countDocuments({
        classId,
        status: 'ACTIVE'
      })

      if (studentCount > 0) {
        throw new Error(`Não é possível remover turma com ${studentCount} estudante(s) ativo(s)`)
      }

      await Class.deleteOne({ classId })
      
      return { success: true }
    } catch (error) {
      console.error('❌ Erro no serviço deleteClass:', error)
      throw error
    }
  }

  async getClassDetails(classId: string, options: {
    includeStudents?: boolean
    includeHistory?: boolean
  } = {}) {
    try {
      const cls = await this.getClassById(classId)
      if (!cls) return null

      const details: any = { ...cls }

      // Adicionar estatísticas detalhadas
      const stats = await this.getDetailedClassStats(classId)
      details.stats = stats

      // Incluir lista de estudantes se solicitado
      if (options.includeStudents) {
        const students = await User.find({ classId }, {
          name: 1,
          email: 1,
          status: 1,
          discordIds: 1,
          enrollmentDate: 1,
          lastActivity: 1
        }).sort({ name: 1 }).lean()
        
        details.students = students
      }

      // Incluir histórico se solicitado
      if (options.includeHistory) {
        const history = await ClassHistory.find({ classId })
          .sort({ dateMoved: -1 })
          .limit(50)
          .lean()
        
        details.recentHistory = history
      }

      return details
    } catch (error) {
      console.error('❌ Erro no serviço getClassDetails:', error)
      throw error
    }
  }

  async fetchMultipleClassData(classIds: string[], options: {
    includeStudents?: boolean
    includeStats?: boolean
  } = {}) {
    try {
      const classes = await Class.find({
        classId: { $in: classIds }
      }).lean()

      const results = await Promise.all(
        classes.map(async (cls) => {
          const result: any = { ...cls }

          if (options.includeStats) {
            const stats = await this.getDetailedClassStats(cls.classId)
            result.stats = stats
          }

          if (options.includeStudents) {
            const students = await User.find({ classId: cls.classId }).lean()
            result.students = students
          }

          return result
        })
      )

      return results
    } catch (error) {
      console.error('❌ Erro no serviço fetchMultipleClassData:', error)
      throw error
    }
  }

  async fetchAllClassData(options: {
    includeStudents?: boolean
    includeStats?: boolean
  } = {}) {
    try {
      const classes = await Class.find({ isActive: true }).lean()

      const results = await Promise.all(
        classes.map(async (cls) => {
          const result: any = { ...cls }

          if (options.includeStats) {
            const stats = await this.getDetailedClassStats(cls.classId)
            result.stats = stats
          }

          if (options.includeStudents) {
            const students = await User.find({ classId: cls.classId }).lean()
            result.students = students
          }

          return result
        })
      )

      return results
    } catch (error) {
      console.error('❌ Erro no serviço fetchAllClassData:', error)
      throw error
    }
  }

  async getClassStats(filters: {
    dateFrom?: string
    dateTo?: string
    classIds?: string[]
  } = {}): Promise<ClassStats> {
    try {
      const { dateFrom, dateTo, classIds } = filters

      // Query base para turmas
      const classQuery: any = {}
      if (classIds && classIds.length > 0) {
        classQuery.classId = { $in: classIds }
      }

      // Query para período de tempo no histórico
      const dateQuery: any = {}
      if (dateFrom || dateTo) {
        dateQuery.dateMoved = {}
        if (dateFrom) dateQuery.dateMoved.$gte = new Date(dateFrom)
        if (dateTo) dateQuery.dateMoved.$lte = new Date(dateTo)
      }

      // Executar consultas em paralelo
      const [
        totalClasses,
        activeClasses,
        totalStudents,
        recentMovements,
        sourceBreakdown,
        studentDistribution
      ] = await Promise.all([
        Class.countDocuments(classQuery),
        Class.countDocuments({ ...classQuery, isActive: true }),
        User.countDocuments(classIds ? { classId: { $in: classIds } } : {}),
        ClassHistory.countDocuments({
          ...dateQuery,
          ...(classIds ? { classId: { $in: classIds } } : {})
        }),
        this.getSourceBreakdown(classQuery),
        this.getStudentDistribution(classIds)
      ])

      return {
        totalClasses,
        totalStudents,
        activeClasses,
        inactiveClasses: totalClasses - activeClasses,
        recentMovements,
        sourceBreakdown,
        studentDistribution
      }
    } catch (error) {
      console.error('❌ Erro no serviço getClassStats:', error)
      throw error
    }
  }

  private async getDetailedClassStats(classId: string) {
    try {
      // ✅ CORRIGIDO: Buscar turma para verificar fonte
      const cls = await Class.findOne({ classId }).lean()
      
      let totalStudents, activeStudents, inactiveStudents, recentEnrollments
      
      if (cls && cls.source === 'curseduca_sync' && cls.curseducaUuid) {
        // Para turmas CursEduca
        [totalStudents, activeStudents, inactiveStudents, recentEnrollments] = await Promise.all([
          User.countDocuments({ 'curseduca.groupCurseducaUuid': cls.curseducaUuid }),
          User.countDocuments({ 'curseduca.groupCurseducaUuid': cls.curseducaUuid, 'combined.status': 'ACTIVE' }),
          User.countDocuments({ 'curseduca.groupCurseducaUuid': cls.curseducaUuid, 'combined.status': { $ne: 'ACTIVE' } }),
          User.countDocuments({
            'curseduca.groupCurseducaUuid': cls.curseducaUuid,
            'curseduca.joinedDate': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          })
        ])
      } else {
        // Para turmas Hotmart e outras (comportamento original)
        [totalStudents, activeStudents, inactiveStudents, recentEnrollments] = await Promise.all([
          User.countDocuments({ classId }),
          User.countDocuments({ classId, status: 'ACTIVE' }),
          User.countDocuments({ classId, status: { $ne: 'ACTIVE' } }),
          User.countDocuments({
            classId,
            enrollmentDate: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          })
        ])
      }
      
      const lastMovement = await ClassHistory.findOne({ classId }, {}, { sort: { dateMoved: -1 } })

      return {
        totalStudents,
        activeStudents,
        inactiveStudents,
        recentEnrollments,
        lastMovement: lastMovement?.dateMoved
      }
    } catch (error) {
      console.error('❌ Erro ao buscar estatísticas detalhadas:', error)
      throw error
    }
  }

  private async getSourceBreakdown(classQuery: any) {
    try {
      const breakdown = await Class.aggregate([
        { $match: classQuery },
        {
          $group: {
            _id: '$source',
            count: { $sum: 1 }
          }
        }
      ])

      const result = {
        hotmart_sync: 0,
        manual: 0,
        import: 0,
        curseduca_sync: 0
      }

      breakdown.forEach(item => {
        if (item._id in result) {
          result[item._id as keyof typeof result] = item.count
        }
      })

      return result
    } catch (error) {
      console.error('❌ Erro ao buscar breakdown por fonte:', error)
      return { hotmart_sync: 0, manual: 0, import: 0, curseduca_sync: 0 }
    }
  }

  private async getStudentDistribution(classIds?: string[]) {
    try {
      const matchQuery: any = {}
      if (classIds && classIds.length > 0) {
        matchQuery.classId = { $in: classIds }
      }

      const distribution = await User.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$classId',
            studentCount: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'classes',
            localField: '_id',
            foreignField: 'classId',
            as: 'classInfo'
          }
        },
        {
          $unwind: {
            path: '$classInfo',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            classId: '$_id',
            className: { $ifNull: ['$classInfo.name', 'Turma Desconhecida'] },
            studentCount: 1
          }
        },
        { $sort: { studentCount: -1 } }
      ])

      return distribution
    } catch (error) {
      console.error('❌ Erro ao buscar distribuição de estudantes:', error)
      return []
    }
  }

  async updateClassStudentCounts() {
    try {
      console.log('🔄 Atualizando contadores de estudantes...')
      
      const classes = await Class.find({}).lean()
      
      for (const cls of classes) {
        // ✅ CORRIGIDO: Contar baseado na fonte da turma
        let count = 0
        if (cls.source === 'curseduca_sync' && cls.curseducaUuid) {
          count = await User.countDocuments({
            'curseduca.groupCurseducaUuid': cls.curseducaUuid,
            'combined.status': 'ACTIVE'
          })
        } else {
          count = await User.countDocuments({
            classId: cls.classId,
            status: 'ACTIVE'
          })
        }
        
        await Class.updateOne(
          { classId: cls.classId },
          { studentCount: count }
        )
      }
      
      console.log(`✅ Contadores atualizados para ${classes.length} turmas`)
      return { updated: classes.length }
    } catch (error) {
      console.error('❌ Erro ao atualizar contadores:', error)
      throw error
    }
  }
}

export const classesService = new ClassesService()

// ===== SERVIÇO DE ESTUDANTES =====

class StudentService {
  async searchStudents(criteria: {
    email?: string
    name?: string
    discordId?: string
    classId?: string
    status?: string
    limit: number
    offset: number
  }) {
    try {
      const { email, name, discordId, classId, status, limit, offset } = criteria

      const query: any = {}

      if (email) {
        query.email = { $regex: email, $options: 'i' }
      }

      if (name) {
        query.name = { $regex: name, $options: 'i' }
      }

      if (discordId) {
        query.discordIds = discordId
      }

      if (classId) {
        query.classId = classId
      }

      if (status) {
        query.status = status
      }

      const [students, total] = await Promise.all([
        User.find(query)
          .limit(limit)
          .skip(offset)
          .sort({ name: 1 })
          .lean(),
        User.countDocuments(query)
      ])

      if (students.length === 0) {
        const error: any = new Error('Nenhum estudante encontrado')
        error.status = 404
        throw error
      }

      // Adicionar nomes das turmas
      const studentsWithClassNames = await Promise.all(
        students.map(async (student) => {
          if (student.classId) {
            const cls = await Class.findOne({ classId: student.classId }, { name: 1 }).lean()
            return {
              ...student,
              className: cls?.name || student.classId
            }
          }
          return student
        })
      )

      return {
        students: studentsWithClassNames,
        total
      }
    } catch (error) {
      console.error('❌ Erro no serviço searchStudents:', error)
      throw error
    }
  }

  async moveStudent(movement: {
    studentId: string
    fromClassId?: string
    toClassId: string
    reason?: string
    performedBy?: string
  }) {
    try {
      const { studentId, fromClassId, toClassId, reason, performedBy } = movement

      // Buscar estudante
      const student = await User.findById(studentId)
      if (!student) {
        throw new Error('Estudante não encontrado')
      }

      // Buscar turma de destino
      const toClass = await Class.findOne({ classId: toClassId })
      if (!toClass) {
        throw new Error('Turma de destino não encontrada')
      }

      // Salvar estado anterior
      const previousClassId = student.classId
      const previousClassName = student.className

      // Buscar nome da turma anterior se necessário
      let fromClassName: string | undefined
      if (previousClassId) {
        const fromClass = await Class.findOne({ classId: previousClassId })
        fromClassName = fromClass?.name || previousClassId
      }

      // Atualizar estudante
      student.classId = toClassId
      student.className = toClass.name
      await student.save()

      // Registrar no histórico
      const historyEntry = new ClassHistory({
        studentId: student._id.toString(),
        studentEmail: student.email,
        studentName: student.name,
        classId: toClassId,
        className: toClass.name,
        fromClassId: previousClassId,
        fromClassName,
        action: 'MOVE',
        reason: reason || 'Movimentação via API',
        performedBy,
        dateMoved: new Date()
      })

      await historyEntry.save()

      // Atualizar contadores das turmas
      if (previousClassId) {
        await this.updateClassStudentCount(previousClassId)
      }
      await this.updateClassStudentCount(toClassId)

      return historyEntry
    } catch (error) {
      console.error('❌ Erro no serviço moveStudent:', error)
      throw error
    }
  }

  async moveMultipleStudents(data: {
    studentIds: string[]
    toClassId: string
    reason?: string
    performedBy?: string
  }) {
    try {
      const { studentIds, toClassId, reason, performedBy } = data

      const results = {
        success: [] as any[],
        errors: [] as any[]
      }

      for (const studentId of studentIds) {
        try {
          const movement = await this.moveStudent({
            studentId,
            toClassId,
            reason,
            performedBy
          })

          results.success.push({
            studentId,
            movement
          })
        } catch (error) {
          results.errors.push({
            studentId,
            error: (error as Error).message
          })
        }
      }

      return results
    } catch (error) {
      console.error('❌ Erro no serviço moveMultipleStudents:', error)
      throw error
    }
  }

  private async updateClassStudentCount(classId: string) {
    try {
      // ✅ CORRIGIDO: Buscar turma para verificar fonte
      const cls = await Class.findOne({ classId }).lean()
      
      let count = 0
      if (cls && cls.source === 'curseduca_sync' && cls.curseducaUuid) {
        count = await User.countDocuments({
          'curseduca.groupCurseducaUuid': cls.curseducaUuid,
          'combined.status': 'ACTIVE'
        })
      } else {
        count = await User.countDocuments({
          classId,
          status: 'ACTIVE'
        })
      }

      await Class.updateOne(
        { classId },
        { studentCount: count }
      )

      return count
    } catch (error) {
      console.error('❌ Erro ao atualizar contador da turma:', error)
      throw error
    }
  }

 async syncComplete(): Promise<any> {
    try {
      console.log('🔄 Iniciando sincronização completa de turmas...');
      
      const response = await api.post('/classes/syncComplete');
      
      if (response.data.success) {
        console.log('✅ Sincronização completa realizada com sucesso');
        return response.data;
      } else {
        throw new Error(response.data.message || 'Erro na sincronização completa');
      }
    } catch (error: any) {
      console.error('❌ Erro na sincronização completa:', error);
      
      // Se o erro tem uma estrutura de resposta da API
      if (error.response?.data) {
        throw new Error(error.response.data.message || 'Erro na sincronização completa');
      }
      
      throw new Error(error.message || 'Erro desconhecido na sincronização completa');
    }
  }

}

export const studentService = new StudentService()