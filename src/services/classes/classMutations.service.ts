/**
 * Class write mutations behind POST /addOrEditClass and DELETE /:classId. The
 * writer owns every Mongoose write (migrated verbatim from ClassesService
 * addOrEditClass/getClassById/deleteClass); the service adds the injected Clock.
 *
 * upsert is the canonical write operation: the public handler and the two
 * residual inactivation consumers (createInactivationList, updateClassStatus)
 * all go through it, so ClassesService.addOrEditClass can be deleted. The delete
 * keeps both legacy student-count checks: the service's source-aware pre-check
 * and the writer's classId-based check.
 */

export interface Clock {
  now(): Date
}

export interface ClassInput {
  classId: string
  name: string
  description?: string
  isActive?: boolean
  estado?: 'ativo' | 'inativo'
  source?: string
}

export interface UpsertResult {
  class: unknown
  isNew: boolean
}

export interface ClassSummary {
  studentCount: number
  [key: string]: unknown
}

export interface PropagacaoDeNome {
  matriculas: number
  historico: number
}

export interface ClassMutationsWriter {
  upsert(input: ClassInput): Promise<UpsertResult>
  /**
   * Reescreve o nome da turma onde ele ficou copiado: nas matrículas dos
   * alunos e nos registos de mudança de turma.
   *
   * A Hotmart só devolve ids; o nome é escrito à mão no backoffice para
   * bater com o que lá se vê. Mas as matrículas e o histórico guardam uma
   * CÓPIA do nome no instante em que foram criados, e ninguém volta lá —
   * uma turma renomeada deixava para trás registos com o nome antigo.
   */
  propagarNome(classId: string, nome: string): Promise<PropagacaoDeNome>
  classSummary(classId: string): Promise<ClassSummary | null>
  remove(classId: string): Promise<void>
}

export type RemoveResult =
  | { kind: 'not_found' }
  | { kind: 'has_students'; studentCount: number }
  | { kind: 'ok'; timestamp: string }

export class ClassMutationsService {
  constructor(
    private readonly writer: ClassMutationsWriter,
    private readonly clock: Clock,
  ) {}

  async upsert(input: ClassInput): Promise<UpsertResult & { timestamp: string; propagado: PropagacaoDeNome }> {
    const result = await this.writer.upsert(input)
    // A turma passa a chamar-se isto em todo o lado, não só na tabela das
    // turmas. Falhar aqui não pode desfazer a edição que já foi gravada.
    const propagado = await this.writer
      .propagarNome(input.classId.trim(), input.name.trim())
      .catch(() => ({ matriculas: 0, historico: 0 }))
    return { ...result, timestamp: this.clock.now().toISOString(), propagado }
  }

  async remove(classId: string): Promise<RemoveResult> {
    // Source-aware pre-check (the legacy controller check).
    const summary = await this.writer.classSummary(classId)
    if (!summary) return { kind: 'not_found' }
    if (summary.studentCount > 0) return { kind: 'has_students', studentCount: summary.studentCount }

    // The writer's remove keeps its own classId-based student-count guard.
    await this.writer.remove(classId)
    return { kind: 'ok', timestamp: this.clock.now().toISOString() }
  }
}
