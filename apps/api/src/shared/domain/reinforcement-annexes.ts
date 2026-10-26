import type { ReportField, ReportTypeConfig, ReportsFlowConfig } from './reports-flow'

export type ReportPdfTemplate = 'annex_alerts' | 'annex_commitment' | 'annex_plan' | 'annex_progress' | 'annex_attendance'
export const REPORT_PDF_TEMPLATES: ReportPdfTemplate[] = ['annex_alerts', 'annex_commitment', 'annex_plan', 'annex_progress', 'annex_attendance']

const field = (key: string, label: string, required = true, type: ReportField['type'] = 'textarea'): ReportField => ({ key, label, required, type })
const optionalNotes = () => field('observaciones', 'Observaciones', false)
const report = (template: ReportPdfTemplate, key: string, label: string, extra: Partial<ReportTypeConfig>): ReportTypeConfig => ({
  key, label, pdfTemplate: template, pdfTitle: label.toUpperCase(), enabled: true, scope: 'student',
  authorRoles: ['teacher', 'tutor'], to: 'subdireccion', triggeredByAlert: false,
  requiresReinforcementCase: false, snapshot: 'none', fields: [], ackDeadlineDays: 3,
  escalateTo: 'autoridad', confidential: false, canDeriveTo: [],
  signatures: ['Docente / tutor', 'Subdirección / responsable del refuerzo'], ...extra,
})

/** Formularios de captura para completar los cinco anexos del Word original, sin reescribirlo.
 * Los campos curriculares son escritos por el docente; no dependen de planificación ni constituyen un PIAE.
 */
const matrixFields = () => ['lengua', 'matematica'].flatMap((prefix) => [
  ['competencia', 'COMPETENCIA ESPECÍFICA'], ['indicador', 'INDICADOR DE EVALUACIÓN'], ['saberes', 'SABERES'],
  ['estrategias', 'ESTRATEGIAS METODOLÓGICAS'], ['recursos', 'RECURSOS'], ['evaluacion', 'EVALUACIÓN'],
].map(([key, label]) => field(`${prefix}_${key}`, `${prefix === 'lengua' ? 'LENGUA Y LITERATURA' : 'MATEMÁTICA'} · ${label}`, false)))

export const REINFORCEMENT_ANNEXES: ReportTypeConfig[] = [
  report('annex_alerts', 'acta_entrega_alertas', 'Anexo 1 · Informe de alertas tempranas a las autoridades', {
    pdfTitle: 'ACTA DE ENTREGA Y RECEPCIÓN DE ALERTAS TEMPRANAS POR BAJO DESEMPEÑO ACADÉMICO',
    scope: 'parallel', snapshot: 'early_alerts', triggeredByAlert: true,
    description: 'Anexo No.1 del Word original. Nómina de varios alumnos por asignatura, paralelo y periodo, dirigida a Subdirección.',
    fields: [field('jornada', 'Jornada: Matutina / Vespertina', true, 'text'), field('fecha_documento', 'Fecha', true, 'date'), field('numero_acta', 'ACTA N° (vacío = folio del informe)', false, 'text'), field('autoridad', 'RECIBIDO POR: Subdirectora', false, 'text')],
    signatures: ['ENTREGADO POR: Docente tutor/a o responsable del grado/curso', 'RECIBIDO POR: Subdirectora'],
  }),
  report('annex_commitment', 'carta_compromiso', 'Anexo 2 · ACTA DE COMPROMISO PARA PADRES DE FAMILIA', {
    to: 'representante', snapshot: 'grades',
    description: 'Anexo N° 2 del Word original. Conserva íntegros los nueve compromisos, la normativa, el horario y las tres firmas.',
    fields: [field('representante', 'Padre/madre de familia o representante legal', true, 'text'), field('jornada', 'Jornada', true, 'text'),
      field('horario_asignaturas', 'HORARIO DE ASISTENCIA · Asignaturas (una por línea)'), field('horario_dias', 'HORARIO DE ASISTENCIA · Días (uno por línea)'), field('horario_horas', 'HORARIO DE ASISTENCIA · Horario (uno por línea)'), field('lugar_fecha', 'Lugar y Fecha', true, 'text')],
    signatures: ['PADRE DE FAMILIA', 'DOCENTE', 'SUBDIRECTORA'],
  }),
  report('annex_plan', 'plan_refuerzo', 'Anexo 3 · PLANIFICACIÓN DE REFUERZO ACADÉMICO INDIVIDUAL', {
    requiresReinforcementCase: true, snapshot: 'reinforcement_case',
    description: 'Anexo N° 3 del Word original. Conserva identificación, modalidades y matriz de Lengua y Literatura / Matemática.',
    fields: [field('docente_refuerzo', 'Profesor/a de refuerzo', true, 'text'), field('entorno', 'Modalidad de refuerzo: dentro del aula / extra-clase', true, 'text'), field('agrupacion', 'Modalidad de refuerzo: Pequeño grupo / Individual', true, 'text'),
      field('horario', 'Horario'), field('duracion', 'Duración prevista', true, 'text'), field('fecha_inicio', 'Fecha de inicio', true, 'date'), field('objetivo', '2.- OBJETIVO'), ...matrixFields(), optionalNotes()],
    signatures: ['SUBDIRECTORA', 'DOCENTE'],
  }),
  report('annex_progress', 'resultados_refuerzo', 'Anexo 4 · INFORME INDIVIDUAL DE AVANCES DEL APRENDIZAJE DEL ESTUDIANTE', {
    to: 'representante', requiresReinforcementCase: true, snapshot: 'reinforcement_case',
    description: 'Anexo N° 4 del Word original. Conserva las dos tablas, el texto del artículo 10.4 y las firmas.',
    fields: [field('docente_refuerzo', 'Profesor/a de refuerzo', true, 'text'), field('logros', 'Logros'), field('dificultades', 'b) Dificultades'), field('sugerencias', 'c) Sugerencias'), field('indicador', 'INDICADOR'), field('competencia_saberes', 'COMPETENCIA Y SABERES REFORZADOS'), field('lugar_fecha', 'Lugar y fecha', true, 'text')],
    signatures: ['f) Docente/ Tutor', 'f) Padre de familia o representante legal'],
  }),
  report('annex_attendance', 'asistencia_refuerzo', 'Anexo 5 · REGISTRO DE ASISTENCIA AL REFUERZO ACADÉMICO', {
    scope: 'parallel', requiresReinforcementCase: true, snapshot: 'reinforcement_sessions',
    description: 'Anexo N° 5 del Word original. Nómina, columnas de fechas y firmas de estudiantes; diez renglones por hoja.',
    fields: [optionalNotes()], signatures: ['DOCENTE DE LA ASIGNATURA'],
  }),
]

/** Carga explícita: solo sustituye los cinco modelos; mantiene los demás informes y el expediente. */
export function withReinforcementAnnexes(config: ReportsFlowConfig): ReportsFlowConfig {
  const next = structuredClone(config)
  if (!next.instances.some((i) => i.key === 'subdireccion')) {
    next.instances.push({ key: 'subdireccion', label: 'Subdirección / responsable del refuerzo', resolver: 'role', role: 'rector' })
  }
  for (const annex of REINFORCEMENT_ANNEXES) {
    const index = next.reportTypes.findIndex((t) => t.key === annex.key)
    if (index < 0) next.reportTypes.push(structuredClone(annex))
    else next.reportTypes[index] = structuredClone(annex)
  }
  return next
}
