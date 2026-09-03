import { Class } from '../../models/Class'
import { User } from '../../models'
import type { ClassDirectoryReader, ClassListFilters, DirectoryClass } from './classDirectory.service'

type Query = Record<string, unknown>

interface InscritosPorTurma {
  _id: string
  n: number
}

/**
 * Owns the Mongoose reads for the class directory, migrated from
 * ClassesService.listClasses: the same query construction and concurrent
 * find+count. The debug-only totalInDatabase probe and its logs — never part of
 * the response — are dropped.
 *
 * A contagem de alunos por turma diz quantos estão inscritos, activos ou não:
 * espelha a plataforma de origem, a Hotmart nas turmas OGI e a CursEduca nas do
 * Clareza. Duas correcções face à versão que esta vertical herdou:
 *   1. contava por `classId` na raiz do utilizador, campo que fica para trás
 *      quando o aluno muda de turma — a Turma 18 | 2605 dava 90 tendo 132. A
 *      verdade está em hotmart.enrolledClasses, que é o que o sync nocturno
 *      escreve;
 *   2. filtrava por `status: 'ACTIVE'`, campo que a inactivação nem chega a
 *      escrever (o schema descarta-o), pelo que excluía alunos ao acaso.
 * Uma agregação para todas as turmas em vez de um countDocuments por turma:
 * ~75ms contra ~7s a somar chamadas individuais.
 */
export class MongooseClassDirectoryReader implements ClassDirectoryReader {
  async listClasses(filters: ClassListFilters): Promise<{ classes: DirectoryClass[]; total: number }> {
    const query: Query = {}
    if (filters.isActive !== undefined) query.isActive = filters.isActive
    if (filters.source) query.source = filters.source
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { classId: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ]
    }

    const sort: Record<string, 1 | -1> = { [filters.sortBy]: filters.sortOrder === 'desc' ? -1 : 1 }

    const [classes, total] = await Promise.all([
      Class.find(query).sort(sort).limit(filters.limit).skip(filters.offset).lean() as unknown as Promise<DirectoryClass[]>,
      Class.countDocuments(query),
    ])

    const idsHotmart = classes
      .filter(cls => cls.source !== 'curseduca_sync')
      .map(cls => cls.classId)
      .filter((classId): classId is string => Boolean(classId))
    // As turmas CursEduca (Clareza) não têm curseducaUuid — são identificadas
    // pelo id próprio da CursEduca, guardado em Class.curseducaId. Do lado do
    // utilizador a inscrição vive em combined.allClasses com source 'curseduca'.
    const idsCurseduca = classes
      .filter(cls => cls.source === 'curseduca_sync')
      .map(cls => (typeof cls.curseducaId === 'string' ? cls.curseducaId : cls.classId))
      .filter((classId): classId is string => Boolean(classId))

    const [porTurmaHotmart, porGrupoCurseduca] = await Promise.all([
      idsHotmart.length
        ? User.aggregate<InscritosPorTurma>([
            { $match: { 'hotmart.enrolledClasses.classId': { $in: idsHotmart } } },
            { $unwind: '$hotmart.enrolledClasses' },
            { $match: { 'hotmart.enrolledClasses.classId': { $in: idsHotmart } } },
            { $group: { _id: '$hotmart.enrolledClasses.classId', n: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
      idsCurseduca.length
        ? User.aggregate<InscritosPorTurma>([
            { $match: { 'combined.allClasses': { $elemMatch: { classId: { $in: idsCurseduca }, source: 'curseduca' } } } },
            { $unwind: '$combined.allClasses' },
            { $match: { 'combined.allClasses.source': 'curseduca', 'combined.allClasses.classId': { $in: idsCurseduca } } },
            { $group: { _id: '$combined.allClasses.classId', n: { $sum: 1 } } },
          ])
        : Promise.resolve([]),
    ])

    const contagemHotmart = new Map(porTurmaHotmart.map(row => [String(row._id), Number(row.n)]))
    const contagemCurseduca = new Map(porGrupoCurseduca.map(row => [String(row._id), Number(row.n)]))

    const withStats = classes.map(cls => ({
      ...cls,
      studentCount: cls.source === 'curseduca_sync'
        ? contagemCurseduca.get(String(cls.curseducaId ?? cls.classId)) ?? 0
        : contagemHotmart.get(String(cls.classId)) ?? 0,
    }))

    return { classes: withStats, total }
  }
}
