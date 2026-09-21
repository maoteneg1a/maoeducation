import { apiClient } from '@/shared/lib/api-client'

export interface PersonalRegisterDto {
  firstName: string
  lastName: string
  email: string
  password: string
  workspaceName?: string
}

export interface PersonalSetupDto {
  profile: 'subject-first' | 'classroom-first' | 'multigrade'
  yearName: string
  yearStart: string
  yearEnd: string
  workspaceName?: string
  /** subject-first: una sola materia, elegida del catálogo oficial de áreas (destrezas o competencias). */
  subjectAreaId?: string
  groups?: Array<{ name: string }>
  parallelName?: string
  /** classroom-first: varias materias, elegidas del catálogo oficial de áreas (destrezas o competencias). */
  subjectAreaIds?: string[]
  /** multigrade: selección explícita grado+materia (unidocente/pluridocente) — mínimo 2. */
  multigradeName?: string
  multigradeSelections?: Array<{ gradeCode: string; subjectAreaId: string }>
  /** Confirmación explícita para incluir grados de 8vo-10mo EGB (extensión superior). */
  allowSuperiorExtension?: boolean
  /**
   * subject-first/classroom-first: grado REAL (ej. "6B") — deriva el subnivel y
   * decide qué competencias/destrezas/saberes por grado (CompetencySaber.gradeCodes)
   * se ofrecen luego al planificar. Multigrado NO usa este campo (ya captura su
   * propio grado por fila en multigradeSelections).
   */
  gradeCode?: string
  /** Modelo de planificación curricular a fijar de una vez para esta cuenta. */
  planningModel?: 'destrezas' | 'competencias'
}

export interface PersonalClassSelection {
  gradeCode: string
  subjectAreaId: string
  /** Períodos/semana reales de esta materia — solo aplica cuando la fila trae needsWeeklyPeriodsOverride. */
  weeklyPeriodsOverride?: number | null
}

export interface PersonalClassRow {
  gradeCode: string
  gradeName: string
  subnivel: string | null
  courseAssignmentId: string
  subjectId: string
  subjectName: string
  subjectAreaId: string | null
  isMultigradeMember: boolean
  hasDependentData: boolean
  weeklyPeriodsOverride: number | null
  /** true si esta materia comparte un bloque de horas MINEDUC (ej. LL+CN+CS+M) y nadie repartió los períodos todavía. */
  needsWeeklyPeriodsOverride: boolean
}

export interface PersonalClassesState {
  yearId: string
  planningModel: 'destrezas' | 'competencias'
  multigradeEnabled: boolean
  allowSuperiorExtension: boolean
  multigradeGroupId: string | null
  rows: PersonalClassRow[]
}

export interface SavePersonalClassesDto {
  selections: PersonalClassSelection[]
  multigradeEnabled: boolean
  allowSuperiorExtension?: boolean
}

export interface SavePersonalClassesResult {
  rows: PersonalClassRow[]
  multigradeGroupId: string | null
  blocked: Array<{ gradeCode: string; subjectName: string; reason: string }>
}

export interface BulkCreateStudentsDto {
  students: Array<{
    firstName: string
    lastName: string
    dni: string
    birthDate?: string
  }>
  parallelId: string
  academicYearId: string
}

export const personalApi = {
  // 90s: bootstrapInstitution siembra centenares de filas (catálogo curricular
  // completo, DUA, evaluación, año lectivo...) en una sola transacción — el
  // backend ya le da 60s de margen a esa transacción, pero el timeout default
  // de 30s del cliente cortaba la conexión antes de que el servidor terminara
  // en producción (latencia de red real, no local). Mismo patrón que ya se
  // corrigió para los endpoints de generación con IA.
  register: (dto: PersonalRegisterDto) =>
    apiClient.post('personal/register', { json: dto, timeout: 90000 }).json<{ message: string }>(),

  login: (dto: { email: string; password: string }) =>
    apiClient.post('personal/login', { json: dto }).json<{ accessToken: string; user: unknown }>(),

  verifyEmail: (token: string) =>
    apiClient.get(`personal/verify-email?token=${token}`).json<{ message: string }>(),

  resendVerification: (email: string) =>
    apiClient.post('personal/resend-verification', { json: { email } }).json<{ message: string }>(),

  // 90s: crea año lectivo+períodos, niveles, paralelos, materias y
  // asignaciones (más grupo/experiencia multigrado si aplica) en una sola
  // pasada — mismo riesgo de timeout que register().
  setup: (dto: PersonalSetupDto) =>
    apiClient.post('personal/setup', { json: dto, timeout: 90000 }).json<{
      yearId: string
      parallelIds: string[]
      subjectIds: string[]
      assignmentIds: string[]
      multigradeGroupId: string | null
    }>(),

  bulkCreateStudents: (dto: BulkCreateStudentsDto) =>
    apiClient.post('enrollments/students/bulk', { json: dto }).json<{
      created: number
      skipped: number
      results: Array<{ firstName: string; lastName: string; dni: string; status: string; reason?: string }>
    }>(),

  getClasses: () => apiClient.get('personal/classes').json<PersonalClassesState>(),

  // 90s: puede crear/borrar varios Levels/Parallels/Subjects/CourseAssignments
  // y armar/desarmar el MultigradeGroup en una sola transacción — mismo riesgo
  // de timeout que setup().
  saveClasses: (dto: SavePersonalClassesDto) =>
    apiClient.put('personal/classes', { json: dto, timeout: 90000 }).json<SavePersonalClassesResult>(),
}
