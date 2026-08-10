/**
 * Class directory reads behind GET /api/classes and /api/classes/listClasses.
 * The reader owns the Mongoose query, concurrent find+count and per-class
 * studentCount (migrated verbatim from ClassesService.listClasses); the service
 * holds the pure simplification and the envelope, with an injected Clock.
 *
 * Preserved verbatim as known legacy debt: the raw (unescaped) search regex, the
 * arbitrary sortBy passed straight to Mongo, the N+1 studentCount, and the Front's
 * limit=1000 default for the simple list. Fixing these is separate work.
 */

export interface Clock {
  now(): Date
}

export interface ClassListFilters {
  search?: string
  isActive?: boolean
  source?: string
  limit: number
  offset: number
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export interface DirectoryClass {
  classId?: string
  _id?: unknown
  name?: string
  isActive?: boolean
  estado?: string
  studentCount: number
  description?: string
  source?: string
  curseducaUuid?: string
  [key: string]: unknown
}

export interface SimpleClass {
  classId: unknown
  name: string
  isActive: boolean
  estado: string
  studentCount: number
  description: string
}

export interface ClassDirectoryReader {
  listClasses(filters: ClassListFilters): Promise<{ classes: DirectoryClass[]; total: number }>
}

const SIMPLE_FILTERS: ClassListFilters = { limit: 1000, offset: 0, sortBy: 'name', sortOrder: 'asc' }

function simplify(cls: DirectoryClass): SimpleClass {
  return {
    classId: cls.classId || cls._id,
    name: cls.name || cls.classId || 'Turma sem nome',
    isActive: cls.isActive ?? true,
    estado: cls.estado || (cls.isActive ? 'ativo' : 'inativo'),
    studentCount: cls.studentCount || 0,
    description: cls.description || '',
  }
}

export class ClassDirectoryService {
  constructor(
    private readonly reader: ClassDirectoryReader,
    private readonly clock: Clock,
  ) {}

  async simpleList(): Promise<SimpleClass[]> {
    const { classes } = await this.reader.listClasses(SIMPLE_FILTERS)
    return classes.map(simplify)
  }

  async list(filters: ClassListFilters): Promise<{ classes: DirectoryClass[]; total: number; timestamp: string }> {
    const { classes, total } = await this.reader.listClasses(filters)
    return { classes, total, timestamp: this.clock.now().toISOString() }
  }
}
