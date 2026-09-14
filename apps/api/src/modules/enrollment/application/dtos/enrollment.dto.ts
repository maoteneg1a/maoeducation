export interface CreateEnrollmentDto {
  studentId: string
  parallelId: string
  academicYearId: string
}

export interface BulkEnrollmentDto {
  studentIds: string[]
  parallelId: string
  academicYearId: string
}

export interface UpdateEnrollmentStatusDto {
  status: 'active' | 'withdrawn'
}

/** Adaptación curricular NEE — si está marcada, el PUD la muestra automáticamente para ese estudiante. */
export interface UpdateEnrollmentAdaptationDto {
  hasAdaptation: boolean
  adaptationType?: 'temporal' | 'permanente' | null
  adaptationNotes?: string | null
}

/** Crear un estudiante nuevo (rol student) y matricularlo, desde la matrícula. */
export interface CreateStudentEnrollmentDto {
  firstName: string
  lastName: string
  dni: string
  birthDate?: string
  parallelId: string
  academicYearId: string
}

/** Crear N estudiantes nuevos y matricularlos (importación masiva desde Excel). */
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
