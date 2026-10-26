import { DOSSIER_CHECKLIST } from './dossier-checklist'
import { REPORT_PDF_TEMPLATES, withReinforcementAnnexes, type ReportPdfTemplate } from './reinforcement-annexes'

/**
 * Flujo de INFORMES entre instancias de la escuela (alertas tempranas, refuerzo,
 * DECE, junta, familia) — 100 % parametrizable por institución.
 *
 * Todo lo de este archivo es PRESET: la institución lo guarda en
 * `Institution.settings.reportsFlow` y lo edita desde Configuración → Informes.
 * Ningún módulo debe asumir que un tipo de informe, instancia o ítem del
 * expediente existe: siempre se lee desde `extractReportsFlow()`.
 *
 * Sin planificación ni destrezas: el único insumo académico es el motor de notas.
 */

export type InstanceResolver =
  | 'tutor_of_parallel'
  | 'teachers_of_parallel'
  | 'role'
  | 'users'
  | 'guardians_of_student'

export interface ReportInstance {
  key: string
  label: string
  resolver: InstanceResolver
  /** Para resolver="role": nombre del rol de la institución. */
  role?: string
  /** Para resolver="users": usuarios concretos. */
  userIds?: string[]
}

export type ReportScope = 'student' | 'parallel' | 'institution'
export type ReportFieldType = 'text' | 'textarea' | 'date'
/** Datos que el sistema adjunta solos al informe (congelados al enviarlo). */
export type ReportSnapshotSource = 'none' | 'grades' | 'reinforcement_case' | 'reinforcement_sessions' | 'early_alerts'

export interface ReportField {
  key: string
  label: string
  type: ReportFieldType
  required: boolean
  placeholder?: string
  defaultValue?: string
}

export interface ReportTypeConfig {
  key: string
  label: string
  description?: string
  enabled: boolean
  scope: ReportScope
  /** Roles que pueden redactarlo. "tutor" = tutor del paralelo (cualquier rol). */
  authorRoles: string[]
  /** Instancia destino (key de `instances`). */
  to: string
  /** Lo sugiere una alerta temprana abierta. */
  triggeredByAlert: boolean
  /** Requiere vincularse a un caso de refuerzo. */
  requiresReinforcementCase: boolean
  snapshot: ReportSnapshotSource
  fields: ReportField[]
  /** Días para acusar recibo (0 = sin plazo). */
  ackDeadlineDays: number
  /** Instancia a la que se avisa si vence el plazo sin acuse. */
  escalateTo?: string | null
  /** El contenido solo lo ven autor y destinatarios (p. ej. DECE). */
  confidential: boolean
  /** Instancias a las que el receptor puede derivar el caso. */
  canDeriveTo: string[]
  /** Encabezado y pie del PDF. */
  pdfTitle: string
  pdfTemplate?: ReportPdfTemplate
  pdfFooter?: string
  signatures: string[]
}

export type DossierSource =
  | 'formal_report'
  | 'parent_meetings'
  | 'reinforcement_case'
  | 'enrollment_adaptation'

export interface DossierItem {
  key: string
  label: string
  source: DossierSource
  /** Para source="formal_report". */
  reportType?: string
  minCount: number
  /** Se exige por cada asignatura en riesgo. */
  perSubject: boolean
  /** Si el ítem solo aplica cuando existe el antecedente (p. ej. informe técnico DECE). */
  optional: boolean
  requiresSignature?: boolean
}

export interface AttachmentCategory {
  key: string
  label: string
  /** Roles que ven el archivo además del que lo subió. Vacío = todo el personal con acceso al caso. */
  visibleToRoles: string[]
}

export interface ReportsFlowConfig {
  folioPrefix: string
  instances: ReportInstance[]
  reportTypes: ReportTypeConfig[]
  dossier: {
    enabled: boolean
    subniveles: string[]
    items: DossierItem[]
  }
  attachments: {
    maxSizeMb: number
    allowedMime: string[]
    /** Roles que pueden subir archivos. El representante nunca está permitido. */
    uploaderRoles: string[]
    categories: AttachmentCategory[]
  }
}

const T = (key: string, label: string, type: ReportFieldType = 'textarea', required = true): ReportField =>
  ({ key, label, type, required })

const base = (o: Partial<ReportTypeConfig> & Pick<ReportTypeConfig, 'key' | 'label' | 'to' | 'pdfTitle'>): ReportTypeConfig => ({
  enabled: true,
  scope: 'student',
  authorRoles: ['teacher'],
  triggeredByAlert: false,
  requiresReinforcementCase: false,
  snapshot: 'none',
  fields: [],
  ackDeadlineDays: 3,
  escalateTo: 'autoridad',
  confidential: false,
  canDeriveTo: [],
  signatures: ['Elaborado por', 'Recibido por'],
  ...o,
})

const BASE_REPORTS_FLOW: ReportsFlowConfig = {
  folioPrefix: 'INF',
  instances: [
    { key: 'tutor', label: 'Tutor de grado/curso', resolver: 'tutor_of_parallel' },
    { key: 'equipo_bienestar', label: 'Equipo de Cuidado y Respuesta para el Bienestar Estudiantil', resolver: 'role', role: 'dece' },
    { key: 'dece', label: 'DECE', resolver: 'role', role: 'dece' },
    { key: 'autoridad', label: 'Autoridad institucional', resolver: 'role', role: 'rector' },
    { key: 'junta', label: 'Junta de docentes de grado/curso', resolver: 'teachers_of_parallel' },
    { key: 'representante', label: 'Representante legal', resolver: 'guardians_of_student' },
  ],
  reportTypes: [
    base({
      key: 'informe_familia', label: 'Informe de rendimiento a la familia', to: 'representante',
      description: 'Art. 10.2 — el docente informa los bajos resultados y las estrategias de refuerzo planificadas.',
      triggeredByAlert: true, snapshot: 'grades', ackDeadlineDays: 5, escalateTo: 'tutor',
      fields: [T('resultados', 'Resultados observados'), T('estrategias', 'Estrategias de refuerzo planificadas'), T('recomendaciones', 'Recomendaciones para la familia')],
      pdfTitle: 'INFORME DE RENDIMIENTO ACADÉMICO AL REPRESENTANTE LEGAL', signatures: ['Docente', 'Representante legal'],
    }),
    base({
      key: 'bajo_rendimiento_tutor', label: 'Informe al tutor por bajo rendimiento', to: 'tutor',
      triggeredByAlert: true, snapshot: 'grades',
      fields: [T('situacion', 'Situación académica observada'), T('acciones', 'Acciones realizadas por el docente'), T('solicitud', 'Solicitud o sugerencia al tutor', 'textarea', false)],
      canDeriveTo: ['equipo_bienestar', 'dece', 'autoridad'],
      pdfTitle: 'INFORME DE BAJO RENDIMIENTO ACADÉMICO', signatures: ['Docente de asignatura', 'Tutor'],
    }),
    base({
      key: 'activacion_equipo_bienestar', label: 'Activación del Equipo de Cuidado y Respuesta', to: 'equipo_bienestar',
      description: 'Art. 4 — ante alertas tempranas se activa el equipo institucional.',
      authorRoles: ['teacher', 'tutor', 'rector', 'inspector'], snapshot: 'grades',
      fields: [T('motivo', 'Motivo de la activación'), T('acciones_previas', 'Acciones previas realizadas')],
      canDeriveTo: ['dece', 'autoridad'],
      pdfTitle: 'ACTIVACIÓN DEL EQUIPO INSTITUCIONAL DE CUIDADO Y RESPUESTA',
    }),
    base({
      key: 'plan_refuerzo', label: 'Informe del plan de refuerzo pedagógico', to: 'tutor',
      requiresReinforcementCase: true, snapshot: 'reinforcement_case', escalateTo: null,
      fields: [T('observaciones', 'Observaciones del docente', 'textarea', false)],
      pdfTitle: 'INFORME DEL PLAN DE REFUERZO PEDAGÓGICO', signatures: ['Docente', 'Tutor'],
    }),
    base({
      key: 'asistencia_refuerzo', label: 'Registro de asistencia al refuerzo', to: 'tutor',
      requiresReinforcementCase: true, snapshot: 'reinforcement_sessions', escalateTo: null,
      fields: [T('observaciones', 'Observaciones', 'textarea', false)],
      pdfTitle: 'REGISTRO DE ASISTENCIA AL REFUERZO PEDAGÓGICO', signatures: ['Docente', 'Tutor'],
    }),
    base({
      key: 'resultados_refuerzo', label: 'Reporte de resultados del refuerzo', to: 'tutor',
      requiresReinforcementCase: true, snapshot: 'reinforcement_case', escalateTo: null,
      fields: [T('analisis', 'Análisis de resultados'), T('decision', 'Decisión pedagógica / siguiente paso')],
      canDeriveTo: ['equipo_bienestar', 'dece', 'autoridad'],
      pdfTitle: 'REPORTE DE RESULTADOS DEL REFUERZO PEDAGÓGICO', signatures: ['Docente', 'Tutor'],
    }),
    base({
      key: 'carta_compromiso', label: 'Carta de compromiso', to: 'representante',
      snapshot: 'grades', ackDeadlineDays: 5, escalateTo: 'tutor',
      fields: [T('compromisos_representante', 'Compromisos del representante'), T('compromisos_estudiante', 'Compromisos del estudiante'), T('compromisos_docente', 'Compromisos del docente'), T('fecha_revision', 'Fecha de revisión', 'date', false)],
      pdfTitle: 'CARTA DE COMPROMISO', signatures: ['Docente de asignatura', 'Representante legal', 'Estudiante'],
    }),
    base({
      key: 'notificacion_psicopedagogica', label: 'Notificación de pertinencia de evaluación psicopedagógica', to: 'autoridad',
      description: 'Art. 10.5 — sin avances tras estrategias DUA, el docente coordina con la autoridad.',
      snapshot: 'grades', escalateTo: null,
      fields: [T('estrategias_aplicadas', 'Estrategias aplicadas y resultados'), T('justificacion', 'Justificación')],
      canDeriveTo: ['representante', 'dece'],
      pdfTitle: 'NOTIFICACIÓN DE PERTINENCIA DE EVALUACIÓN PSICOPEDAGÓGICA',
    }),
    base({
      key: 'ficha_deteccion_dece', label: 'Ficha de detección remitida al DECE', to: 'dece',
      authorRoles: ['teacher', 'tutor', 'rector', 'inspector'], snapshot: 'grades', confidential: true, escalateTo: 'autoridad',
      fields: [T('motivo', 'Motivo de la remisión'), T('indicadores', 'Indicadores observados'), T('acciones_previas', 'Acciones previas')],
      canDeriveTo: ['autoridad'],
      pdfTitle: 'FICHA DE DETECCIÓN Y REMISIÓN AL DECE', signatures: ['Remitente', 'DECE'],
    }),
    base({
      key: 'informe_tecnico_dece', label: 'Informe técnico del DECE', to: 'autoridad',
      authorRoles: ['dece'], confidential: true, escalateTo: null,
      fields: [T('resumen', 'Resumen del caso'), T('recomendaciones', 'Recomendaciones')],
      pdfTitle: 'INFORME TÉCNICO DEL DECE', signatures: ['Profesional DECE', 'Autoridad'],
    }),
    base({
      key: 'adaptaciones_curriculares', label: 'Informe de adaptaciones curriculares', to: 'autoridad',
      escalateTo: null,
      fields: [T('tipo', 'Tipo de adaptación', 'text'), T('detalle', 'Adaptaciones realizadas'), T('seguimiento', 'Seguimiento y resultados')],
      pdfTitle: 'INFORME DE ADAPTACIONES CURRICULARES',
    }),
    base({
      key: 'acta_junta', label: 'Acta de junta de docentes', to: 'autoridad',
      authorRoles: ['tutor', 'rector'], scope: 'student', escalateTo: null,
      description: 'Arts. 23 y 27 — estrategias metodológicas y decisión de la junta.',
      fields: [T('asistentes', 'Asistentes'), T('estrategias', 'Estrategias metodológicas acordadas'), T('decision', 'Resolución / recomendación de la junta')],
      pdfTitle: 'ACTA DE JUNTA DE DOCENTES DE GRADO/CURSO', signatures: ['Tutor', 'Autoridad'],
    }),
    base({
      key: 'acta_socializacion_criterios', label: 'Acta de socialización de criterios de evaluación', to: 'autoridad',
      authorRoles: ['teacher', 'tutor', 'rector'], scope: 'parallel', escalateTo: null,
      fields: [T('fecha_reunion', 'Fecha de la reunión', 'date'), T('asistentes', 'Asistentes'), T('contenido', 'Criterios socializados')],
      pdfTitle: 'ACTA DE SOCIALIZACIÓN DE CRITERIOS DE EVALUACIÓN', signatures: ['Responsable', 'Autoridad'],
    }),
    base({
      key: 'acta_socializacion_mejora', label: 'Acta de socialización de lineamientos de mejora de calificaciones', to: 'autoridad',
      authorRoles: ['teacher', 'tutor', 'rector'], scope: 'parallel', escalateTo: null,
      fields: [T('fecha_reunion', 'Fecha de la reunión', 'date'), T('asistentes', 'Asistentes (estudiantes y representantes)'), T('contenido', 'Lineamientos socializados')],
      pdfTitle: 'ACTA DE SOCIALIZACIÓN DE LINEAMIENTOS DE MEJORA DE CALIFICACIONES', signatures: ['Responsable', 'Autoridad'],
    }),
  ],
  dossier: {
    enabled: true,
    subniveles: ['media', 'superior', 'bgu'],
    items: DOSSIER_CHECKLIST,
  },
  attachments: {
    maxSizeMb: 10,
    allowedMime: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    uploaderRoles: ['teacher', 'rector', 'inspector', 'dece', 'admin'],
    categories: [
      { key: 'evidencia_estudiante', label: 'Evidencia / trabajo del estudiante', visibleToRoles: [] },
      { key: 'asistencia_firmada', label: 'Hoja de asistencia firmada', visibleToRoles: [] },
      { key: 'compromiso_firmado', label: 'Compromiso firmado (escaneado)', visibleToRoles: [] },
      { key: 'comunicacion', label: 'Comunicación enviada al representante', visibleToRoles: [] },
      { key: 'informe_psicopedagogico', label: 'Informe psicopedagógico', visibleToRoles: ['dece', 'rector'] },
      { key: 'otro', label: 'Otro', visibleToRoles: [] },
    ],
  },
}

export const DEFAULT_REPORTS_FLOW = withReinforcementAnnexes(BASE_REPORTS_FLOW)

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** Config de la institución con fallback al preset (cada sección se reemplaza completa si existe). */
export function extractReportsFlow(settings: unknown): ReportsFlowConfig {
  const s = (isObj(settings) ? settings : {}) as Obj
  const rf = (isObj(s.reportsFlow) ? s.reportsFlow : {}) as Partial<ReportsFlowConfig>
  const d = DEFAULT_REPORTS_FLOW
  let types = Array.isArray(rf.reportTypes) && rf.reportTypes.length ? rf.reportTypes : d.reportTypes
  // Corrige exclusivamente la asociación anterior entre el Anexo 1 y el informe al tutor.
  const misplaced = types.find((t) => t.key === 'bajo_rendimiento_tutor' && t.pdfTemplate === 'annex_alerts')
  if (misplaced) {
    types = types.filter((t) => t !== misplaced)
    if (!types.some((t) => t.key === 'acta_entrega_alertas')) types = [...types, { ...misplaced, key: 'acta_entrega_alertas' }]
    types = [...types, structuredClone(d.reportTypes.find((t) => t.key === 'bajo_rendimiento_tutor')!)]
  }
  const dossier = isObj(rf.dossier) ? { ...d.dossier, ...rf.dossier } : d.dossier
  const dossierItems = dossier.items.map((item) => ({
    ...item,
    requiresSignature: item.requiresSignature ?? (item.reportType === 'carta_compromiso' || item.source === 'parent_meetings'),
    label: item.reportType === 'bajo_rendimiento_tutor' && item.label === 'Informes a las autoridades por bajo rendimiento'
      ? 'Informe remitido al tutor de aula o grado por el bajo rendimiento (mínimo tres).' : item.label,
  }))
  return {
    folioPrefix: typeof rf.folioPrefix === 'string' && rf.folioPrefix.trim() ? rf.folioPrefix.trim() : d.folioPrefix,
    instances: Array.isArray(rf.instances) && rf.instances.length ? rf.instances : d.instances,
    reportTypes: types,
    dossier: { ...dossier, items: dossierItems },
    attachments: isObj(rf.attachments) ? { ...d.attachments, ...rf.attachments } : d.attachments,
  }
}

/** Valida coherencia interna; devuelve la lista de errores (vacía = válida). */
export function validateReportsFlow(cfg: ReportsFlowConfig): string[] {
  const errors: string[] = []
  const keyRe = /^[a-z0-9_]{2,60}$/
  const instanceKeys = new Set<string>()
  for (const i of cfg.instances) {
    if (!keyRe.test(i.key)) errors.push(`Clave de instancia inválida: "${i.key}"`)
    if (instanceKeys.has(i.key)) errors.push(`Instancia duplicada: "${i.key}"`)
    instanceKeys.add(i.key)
    if (!i.label?.trim()) errors.push(`La instancia "${i.key}" necesita un nombre`)
    if (i.resolver === 'role' && !i.role) errors.push(`La instancia "${i.key}" necesita un rol`)
    if (i.resolver === 'users' && !(i.userIds?.length)) errors.push(`La instancia "${i.key}" necesita al menos un usuario`)
  }
  const typeKeys = new Set<string>()
  for (const t of cfg.reportTypes) {
    if (!keyRe.test(t.key)) errors.push(`Clave de informe inválida: "${t.key}"`)
    if (typeKeys.has(t.key)) errors.push(`Tipo de informe duplicado: "${t.key}"`)
    typeKeys.add(t.key)
    if (t.pdfTemplate && !REPORT_PDF_TEMPLATES.includes(t.pdfTemplate)) errors.push(`Formato PDF inválido en "${t.label}"`)
    if (t.snapshot === 'early_alerts' && (t.scope !== 'parallel' || cfg.instances.find((i) => i.key === t.to)?.resolver === 'guardians_of_student')) errors.push(`La nómina de alertas requiere alcance por paralelo y destinatario del personal ("${t.label}")`)
    const sources = { annex_alerts: 'early_alerts', annex_commitment: 'grades', annex_plan: 'reinforcement_case', annex_progress: 'reinforcement_case', annex_attendance: 'reinforcement_sessions' }
    if (t.pdfTemplate && REPORT_PDF_TEMPLATES.includes(t.pdfTemplate) && t.snapshot !== sources[t.pdfTemplate]) errors.push(`El formato de anexo necesita sus datos automáticos correspondientes ("${t.label}")`)
    if (!t.label?.trim()) errors.push(`El informe "${t.key}" necesita un nombre`)
    if (!instanceKeys.has(t.to)) errors.push(`El informe "${t.label}" apunta a una instancia inexistente: "${t.to}"`)
    if (t.escalateTo && !instanceKeys.has(t.escalateTo)) errors.push(`El informe "${t.label}" escala a una instancia inexistente: "${t.escalateTo}"`)
    for (const d of t.canDeriveTo ?? []) if (!instanceKeys.has(d)) errors.push(`El informe "${t.label}" deriva a una instancia inexistente: "${d}"`)
    if (t.ackDeadlineDays < 0 || t.ackDeadlineDays > 90) errors.push(`Plazo de acuse fuera de rango en "${t.label}"`)
    const fieldKeys = new Set<string>()
    for (const f of t.fields ?? []) {
      if (!keyRe.test(f.key)) errors.push(`Campo inválido "${f.key}" en "${t.label}"`)
      if (fieldKeys.has(f.key)) errors.push(`Campo duplicado "${f.key}" en "${t.label}"`)
      fieldKeys.add(f.key)
    }
    if (!t.authorRoles?.length) errors.push(`El informe "${t.label}" necesita al menos un rol que lo redacte`)
    if (t.authorRoles?.includes('guardian') || t.authorRoles?.includes('student')) errors.push(`Representantes y estudiantes no pueden redactar informes ("${t.label}")`)
  }
  for (const it of cfg.dossier.items) {
    if (it.source === 'formal_report' && (!it.reportType || !typeKeys.has(it.reportType))) {
      errors.push(`El ítem del expediente "${it.label}" apunta a un informe inexistente`)
    }
    if (it.minCount < 0) errors.push(`Mínimo inválido en "${it.label}"`)
  }
  if (cfg.attachments.uploaderRoles.includes('guardian') || cfg.attachments.uploaderRoles.includes('student')) {
    errors.push('Representantes y estudiantes no pueden subir archivos')
  }
  if (cfg.attachments.maxSizeMb <= 0 || cfg.attachments.maxSizeMb > 10) errors.push('El tamaño máximo de archivo debe estar entre 1 y 10 MB')
  return errors
}
