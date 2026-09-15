import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'

/**
 * Ruta a un JSON de seed en prisma/seeds/curriculum/. Deliberadamente NO usa
 * __dirname: tsup empaqueta todo src/ en un único dist/server.js, así que en
 * producción __dirname apunta a dist/ y "../../../../../prisma/..." termina
 * subiendo más allá de la raíz del filesystem (bug real que rompía la creación
 * de instituciones en Railway: ENOENT en '/prisma/seeds/...'). process.cwd()
 * es estable en dev (`cd apps/api && pnpm dev`) y en Railway (nixpacks corre
 * cada servicio con cwd = apps/api), porque prisma/ vive en la raíz de ese paquete.
 */
function curriculumFilePath(fileName: string): string {
  return path.join(process.cwd(), 'prisma/seeds/curriculum', fileName)
}

/**
 * Banco curricular MINEDUC (Currículo Priorizado con Énfasis en Competencias,
 * edición 2025 con Inserciones Curriculares 2024) cargado desde JSON pre-parseado
 * de los documentos oficiales. Estructura: Área -> subnivel -> Criterio de
 * Evaluación -> Destreza con Criterio de Desempeño (la desagregación oficial).
 * Ver prisma/seeds/curriculum/default-curriculum.json.
 */
interface DefaultCurriculumSkill {
  code: string
  description: string
  indicatorText: string | null
  profileRefs: string[]
  ageRange: string | null
}
interface DefaultCurriculumCriterion {
  code: string
  description: string
  skills: DefaultCurriculumSkill[]
}
interface DefaultCurriculumArea {
  code: string
  name: string
  subniveles: Record<string, DefaultCurriculumCriterion[]>
}

let cachedDefaultCurriculum: DefaultCurriculumArea[] | null = null

export function loadDefaultCurriculum(): DefaultCurriculumArea[] {
  if (cachedDefaultCurriculum) return cachedDefaultCurriculum
  const filePath = curriculumFilePath('default-curriculum.json')
  cachedDefaultCurriculum = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DefaultCurriculumArea[]
  return cachedDefaultCurriculum
}

/**
 * Banco curricular por COMPETENCIAS (Currículo Nacional por Competencias, CNC-
 * MINEDUC) — modelo alternativo y configurable al de destrezas. Estructura:
 * Área -> subnivel -> Competencia específica -> Indicadores + Saberes (sin
 * nivel "criterio" intermedio: la competencia específica lo reemplaza).
 * Ver prisma/seeds/curriculum/default-competencies.json.
 */
interface DefaultCompetencyIndicator {
  code: string
  text: string
}
interface DefaultCompetencySaber {
  type: string
  code: string
  description: string
}
interface DefaultCompetency {
  code: string
  text: string
  keyCompetencyCodes: string[]
  indicators: DefaultCompetencyIndicator[]
  sabers: DefaultCompetencySaber[]
}
interface DefaultCompetencyArea {
  code: string
  name: string
  subniveles: Record<string, DefaultCompetency[]>
}

let cachedDefaultCompetencies: DefaultCompetencyArea[] | null = null

export function loadDefaultCompetencies(): DefaultCompetencyArea[] {
  if (cachedDefaultCompetencies) return cachedDefaultCompetencies
  const filePath = curriculumFilePath('default-competencies.json')
  cachedDefaultCompetencies = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DefaultCompetencyArea[]
  return cachedDefaultCompetencies
}

/** Catálogo fijo global de las 7 competencias clave transversales (CNC-MINEDUC). */
export interface DefaultKeyCompetency {
  code: string
  name: string
  shortName: string
  description: string
  color: string | null
  sortOrder: number
}

let cachedKeyCompetencies: DefaultKeyCompetency[] | null = null

export function loadKeyCompetencies(): DefaultKeyCompetency[] {
  if (cachedKeyCompetencies) return cachedKeyCompetencies
  const filePath = curriculumFilePath('key-competencies.json')
  cachedKeyCompetencies = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DefaultKeyCompetency[]
  return cachedKeyCompetencies
}

/**
 * Catálogo operativo DUA (CAST 2.2) — checkpoints con estrategias prácticas ya
 * redactadas, filtrables por fase pedagógica (ANTICIPATION/CONSTRUCTION/
 * CONSOLIDATION). Global, compartido por ambos modelos de planificación.
 */
export interface DefaultDuaStrategy {
  text: string
  compatiblePhases: string[]
  compatiblePurposes: string[]
  sourcePage: number | null
}
export interface DefaultDuaCheckpoint {
  operationalCode: string
  principleName: string
  guidelineNumber: number
  guidelineName: string
  checkpointNumber: string
  checkpointText: string
  sortOrder: number
  strategies: DefaultDuaStrategy[]
}

let cachedDuaCatalog: DefaultDuaCheckpoint[] | null = null

export function loadDuaCatalog(): DefaultDuaCheckpoint[] {
  if (cachedDuaCatalog) return cachedDuaCatalog
  const filePath = curriculumFilePath('dua-catalog.json')
  cachedDuaCatalog = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DefaultDuaCheckpoint[]
  return cachedDuaCatalog
}

/** Catálogo fijo de técnicas e instrumentos de evaluación (compatibilidad técnica<->instrumento). */
export interface DefaultAssessmentCatalog {
  techniques: { code: string; label: string; compatibleInstrumentCodes: string[]; sortOrder: number }[]
  instruments: { code: string; label: string; sortOrder: number }[]
}

let cachedAssessmentCatalog: DefaultAssessmentCatalog | null = null

export function loadAssessmentCatalog(): DefaultAssessmentCatalog {
  if (cachedAssessmentCatalog) return cachedAssessmentCatalog
  const filePath = curriculumFilePath('assessment-catalog.json')
  cachedAssessmentCatalog = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DefaultAssessmentCatalog
  return cachedAssessmentCatalog
}

/**
 * Bancos de ejes de inserción curricular transversal (socioemocional,
 * desarrollo sostenible, cívica, vial, financiera) — candidatos textuales de
 * referencia que el docente consulta al redactar, no bloquean nada.
 */
export interface DefaultInsertionCandidate {
  sourceCode: string
  text: string
  page: number | null
}
export interface DefaultInsertionBank {
  key: string
  title: string
  candidates: DefaultInsertionCandidate[]
}

let cachedInsertionBanks: DefaultInsertionBank[] | null = null

export function loadInsertionBanks(): DefaultInsertionBank[] {
  if (cachedInsertionBanks) return cachedInsertionBanks
  const filePath = curriculumFilePath('insertion-banks.json')
  cachedInsertionBanks = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DefaultInsertionBank[]
  return cachedInsertionBanks
}

/**
 * Carga horaria oficial (períodos semanales por grado+materia), fuente: Acuerdo
 * MINEDUC-2023-00008-A, art. 7. Global (no por institución) — igual a los demás
 * catálogos operativos. Ver prisma/seeds/curriculum/curricular-workload.json.
 */
export interface DefaultCurricularWorkload {
  sublevel: string
  levelCodes: string[]
  educationOffer: string
  subjectCodes: string[]
  weeklyPeriods: number | null
  groupWeeklyPeriods: number | null
  periodMinutes: number
  sourceType: string
  sourceDocument: string
  notes: string | null
}

let cachedCurricularWorkload: DefaultCurricularWorkload[] | null = null

export function loadCurricularWorkload(): DefaultCurricularWorkload[] {
  if (cachedCurricularWorkload) return cachedCurricularWorkload
  const filePath = curriculumFilePath('curricular-workload.json')
  cachedCurricularWorkload = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DefaultCurricularWorkload[]
  return cachedCurricularWorkload
}

/**
 * Configuración por defecto de una institución nueva.
 * Estas constantes son la ÚNICA fuente de verdad de la matriz RBAC y los
 * catálogos base: las usan tanto el seed (`prisma/seeds/index.ts`) como el
 * superadmin al crear una institución (`create-institution.use-case.ts`).
 */

export const SYSTEM_ROLES = [
  { name: 'admin', label: 'Administrador', isSystem: true },
  { name: 'rector', label: 'Rector/Autoridad', isSystem: true },
  { name: 'inspector', label: 'Inspector', isSystem: true },
  { name: 'dece', label: 'DECE', isSystem: true },
  { name: 'teacher', label: 'Profesor', isSystem: true },
  { name: 'student', label: 'Alumno', isSystem: true },
  { name: 'guardian', label: 'Padre/Representante', isSystem: true },
] as const

export const BASE_PERMISSIONS = [
  // users
  { resource: 'users', action: 'read', scope: 'all' },
  { resource: 'users', action: 'read', scope: 'own' },
  { resource: 'users', action: 'write', scope: 'all' },
  { resource: 'users', action: 'write', scope: 'own' },
  { resource: 'users', action: 'manage', scope: 'all' },
  { resource: 'users', action: 'manage', scope: 'own' },
  // academic_config
  { resource: 'academic_config', action: 'read', scope: 'all' },
  { resource: 'academic_config', action: 'manage', scope: 'all' },
  // enrollment (matrículas)
  { resource: 'enrollment', action: 'read', scope: 'all' },
  { resource: 'enrollment', action: 'read', scope: 'own' },
  { resource: 'enrollment', action: 'manage', scope: 'all' },
  { resource: 'enrollment', action: 'manage', scope: 'own' },
  // institution_config (branding, ajustes de la institución)
  { resource: 'institution_config', action: 'read', scope: 'own' },
  { resource: 'institution_config', action: 'manage', scope: 'all' },
  // anamnesis (ficha + plantillas)
  { resource: 'anamnesis', action: 'read', scope: 'all' },
  { resource: 'anamnesis', action: 'read', scope: 'own' },
  { resource: 'anamnesis', action: 'manage', scope: 'all' },
  { resource: 'anamnesis', action: 'manage', scope: 'own' },
  // banco curricular MINEDUC (destrezas/criterios de evaluación)
  { resource: 'curriculum', action: 'read', scope: 'all' },
  { resource: 'curriculum', action: 'write', scope: 'own' },
  { resource: 'curriculum', action: 'manage', scope: 'all' },
  // planificaciones (PCA/PUD)
  { resource: 'planning', action: 'read', scope: 'all' },
  { resource: 'planning', action: 'read', scope: 'own' },
  { resource: 'planning', action: 'write', scope: 'own' },
  { resource: 'planning', action: 'manage', scope: 'all' },
  // activities
  { resource: 'activities', action: 'read', scope: 'all' },
  { resource: 'activities', action: 'read', scope: 'own' },
  { resource: 'activities', action: 'write', scope: 'own' },
  // grades
  { resource: 'grades', action: 'read', scope: 'all' },
  { resource: 'grades', action: 'read', scope: 'own' },
  { resource: 'grades', action: 'write', scope: 'own' },
  // attendance
  { resource: 'attendance', action: 'read', scope: 'all' },
  { resource: 'attendance', action: 'read', scope: 'own' },
  { resource: 'attendance', action: 'write', scope: 'own' },
  // incidents
  { resource: 'incidents', action: 'read', scope: 'all' },
  { resource: 'incidents', action: 'read', scope: 'own' },
  { resource: 'incidents', action: 'write', scope: 'own' },
  { resource: 'incidents', action: 'write', scope: 'all' },
  { resource: 'incidents', action: 'manage', scope: 'all' },
  // incident_types (catálogo configurable de faltas)
  { resource: 'incident_types', action: 'read', scope: 'all' },
  { resource: 'incident_types', action: 'manage', scope: 'all' },
  // parent_meetings (atención a padres de familia / bitácora)
  { resource: 'parent_meetings', action: 'read', scope: 'all' },
  { resource: 'parent_meetings', action: 'read', scope: 'own' },
  { resource: 'parent_meetings', action: 'write', scope: 'all' },
  { resource: 'parent_meetings', action: 'write', scope: 'own' },
  { resource: 'parent_meetings', action: 'manage', scope: 'all' },
  // student_folder (carpeta / expediente del estudiante)
  { resource: 'student_folder', action: 'read', scope: 'all' },
  { resource: 'student_folder', action: 'read', scope: 'own' },
  // reports
  { resource: 'reports', action: 'read', scope: 'all' },
  { resource: 'reports', action: 'read', scope: 'own' },
  { resource: 'reports', action: 'manage', scope: 'all' },
  // insumos
  { resource: 'insumos', action: 'manage', scope: 'all' },
  { resource: 'insumos', action: 'read', scope: 'own' },
  { resource: 'insumos', action: 'write', scope: 'own' },
  // tasks
  { resource: 'tasks', action: 'read', scope: 'all' },
  { resource: 'tasks', action: 'read', scope: 'own' },
  { resource: 'tasks', action: 'write', scope: 'own' },
] as const

export const ROLE_PERMISSIONS: Array<{ roleName: string; permKey: string }> = [
  // Admin tiene todo
  { roleName: 'admin', permKey: 'users:manage:all' },
  { roleName: 'admin', permKey: 'academic_config:manage:all' },
  { roleName: 'admin', permKey: 'institution_config:manage:all' },
  { roleName: 'admin', permKey: 'anamnesis:manage:all' },
  { roleName: 'admin', permKey: 'activities:read:all' },
  { roleName: 'admin', permKey: 'grades:read:all' },
  { roleName: 'admin', permKey: 'attendance:read:all' },
  { roleName: 'admin', permKey: 'incidents:manage:all' },
  { roleName: 'admin', permKey: 'incidents:read:all' },
  { roleName: 'admin', permKey: 'incidents:write:all' },
  { roleName: 'admin', permKey: 'incident_types:manage:all' },
  { roleName: 'admin', permKey: 'parent_meetings:manage:all' },
  { roleName: 'admin', permKey: 'parent_meetings:read:all' },
  { roleName: 'admin', permKey: 'parent_meetings:write:all' },
  { roleName: 'admin', permKey: 'student_folder:read:all' },
  { roleName: 'admin', permKey: 'reports:manage:all' },
  { roleName: 'admin', permKey: 'insumos:manage:all' },
  { roleName: 'admin', permKey: 'tasks:read:all' },
  { roleName: 'admin', permKey: 'curriculum:read:all' },
  { roleName: 'admin', permKey: 'curriculum:manage:all' },
  { roleName: 'admin', permKey: 'planning:read:all' },
  { roleName: 'admin', permKey: 'planning:manage:all' },
  // Rector / Autoridad — gestiona incidentes y aprueba medidas
  { roleName: 'rector', permKey: 'users:read:all' },
  { roleName: 'rector', permKey: 'incidents:manage:all' },
  { roleName: 'rector', permKey: 'incidents:read:all' },
  { roleName: 'rector', permKey: 'incidents:write:all' },
  { roleName: 'rector', permKey: 'incident_types:manage:all' },
  { roleName: 'rector', permKey: 'parent_meetings:read:all' },
  { roleName: 'rector', permKey: 'parent_meetings:write:all' },
  { roleName: 'rector', permKey: 'student_folder:read:all' },
  { roleName: 'rector', permKey: 'reports:read:all' },
  // DECE — gestiona casos derivados y seguimiento
  { roleName: 'dece', permKey: 'users:read:all' },
  { roleName: 'dece', permKey: 'incidents:read:all' },
  { roleName: 'dece', permKey: 'incidents:write:all' },
  { roleName: 'dece', permKey: 'incident_types:read:all' },
  { roleName: 'dece', permKey: 'parent_meetings:read:all' },
  { roleName: 'dece', permKey: 'parent_meetings:write:all' },
  { roleName: 'dece', permKey: 'student_folder:read:all' },
  // Inspector
  { roleName: 'inspector', permKey: 'users:read:all' },
  { roleName: 'inspector', permKey: 'attendance:read:all' },
  { roleName: 'inspector', permKey: 'incidents:read:all' },
  { roleName: 'inspector', permKey: 'incidents:write:all' },
  { roleName: 'inspector', permKey: 'incident_types:read:all' },
  { roleName: 'inspector', permKey: 'parent_meetings:read:all' },
  { roleName: 'inspector', permKey: 'parent_meetings:write:all' },
  { roleName: 'inspector', permKey: 'student_folder:read:all' },
  { roleName: 'inspector', permKey: 'anamnesis:manage:all' },
  { roleName: 'inspector', permKey: 'reports:read:all' },
  // Profesor
  { roleName: 'teacher', permKey: 'academic_config:read:all' },
  { roleName: 'teacher', permKey: 'enrollment:read:own' },
  { roleName: 'teacher', permKey: 'enrollment:manage:own' },
  { roleName: 'teacher', permKey: 'users:read:own' },
  { roleName: 'teacher', permKey: 'users:write:own' },
  { roleName: 'teacher', permKey: 'users:manage:own' },
  { roleName: 'teacher', permKey: 'anamnesis:read:own' },
  { roleName: 'teacher', permKey: 'anamnesis:manage:own' },
  { roleName: 'teacher', permKey: 'activities:read:own' },
  { roleName: 'teacher', permKey: 'activities:write:own' },
  { roleName: 'teacher', permKey: 'grades:read:own' },
  { roleName: 'teacher', permKey: 'grades:write:own' },
  { roleName: 'teacher', permKey: 'attendance:read:own' },
  { roleName: 'teacher', permKey: 'attendance:write:own' },
  { roleName: 'teacher', permKey: 'incidents:read:own' },
  { roleName: 'teacher', permKey: 'incidents:write:own' },
  { roleName: 'teacher', permKey: 'incident_types:read:all' },
  { roleName: 'teacher', permKey: 'parent_meetings:read:own' },
  { roleName: 'teacher', permKey: 'parent_meetings:write:own' },
  { roleName: 'teacher', permKey: 'student_folder:read:own' },
  { roleName: 'teacher', permKey: 'insumos:read:own' },
  { roleName: 'teacher', permKey: 'insumos:write:own' },
  { roleName: 'teacher', permKey: 'tasks:read:own' },
  { roleName: 'teacher', permKey: 'tasks:write:own' },
  { roleName: 'teacher', permKey: 'curriculum:read:all' },
  { roleName: 'teacher', permKey: 'curriculum:write:own' },
  { roleName: 'teacher', permKey: 'planning:read:own' },
  { roleName: 'teacher', permKey: 'planning:write:own' },
  // Alumno/Padre
  { roleName: 'student', permKey: 'activities:read:own' },
  { roleName: 'student', permKey: 'grades:read:own' },
  { roleName: 'student', permKey: 'attendance:read:own' },
  { roleName: 'student', permKey: 'incidents:read:own' },
  { roleName: 'student', permKey: 'tasks:read:own' },
  { roleName: 'guardian', permKey: 'activities:read:own' },
  { roleName: 'guardian', permKey: 'grades:read:own' },
  { roleName: 'guardian', permKey: 'attendance:read:own' },
  { roleName: 'guardian', permKey: 'incidents:read:own' },
  { roleName: 'guardian', permKey: 'tasks:read:own' },
]

// `subnivel` alinea cada grado con el banco curricular MINEDUC (CurriculumCriterion.subnivel):
// preparatoria (1ro EGB) | elemental (2do-4to) | media (5to-7mo) | superior (8vo-10mo) | bgu (bachillerato)
export const DEFAULT_LEVELS = [
  { code: '1B', name: '1ro de Básica', sortOrder: 1, subnivel: 'preparatoria' },
  { code: '2B', name: '2do de Básica', sortOrder: 2, subnivel: 'elemental' },
  { code: '3B', name: '3ro de Básica', sortOrder: 3, subnivel: 'elemental' },
  { code: '4B', name: '4to de Básica', sortOrder: 4, subnivel: 'elemental' },
  { code: '5B', name: '5to de Básica', sortOrder: 5, subnivel: 'media' },
  { code: '6B', name: '6to de Básica', sortOrder: 6, subnivel: 'media' },
  { code: '7B', name: '7mo de Básica', sortOrder: 7, subnivel: 'media' },
  { code: '8B', name: '8vo de Básica', sortOrder: 8, subnivel: 'superior' },
  { code: '9B', name: '9no de Básica', sortOrder: 9, subnivel: 'superior' },
  { code: '10B', name: '10mo de Básica', sortOrder: 10, subnivel: 'superior' },
  { code: '1BGU', name: '1ro de Bachillerato', sortOrder: 11, subnivel: 'bgu' },
  { code: '2BGU', name: '2do de Bachillerato', sortOrder: 12, subnivel: 'bgu' },
  { code: '3BGU', name: '3ro de Bachillerato', sortOrder: 13, subnivel: 'bgu' },
] as const

export const DEFAULT_INCIDENT_TYPES = [
  { code: 'atraso', name: 'Atraso reiterado', severity: 'leve', requiresDece: false, requiresCommitment: false, sortOrder: 1 },
  { code: 'indisciplina_aula', name: 'Indisciplina en el aula', severity: 'leve', requiresDece: false, requiresCommitment: false, sortOrder: 2 },
  { code: 'danio_bienes', name: 'Daño a bienes de la institución', severity: 'grave', requiresDece: false, requiresCommitment: true, sortOrder: 3 },
  { code: 'agresion_verbal', name: 'Agresión verbal', severity: 'grave', requiresDece: true, requiresCommitment: true, sortOrder: 4 },
  { code: 'agresion_fisica', name: 'Agresión física', severity: 'muy_grave', requiresDece: true, requiresCommitment: true, sortOrder: 5 },
  { code: 'acoso_escolar', name: 'Acoso escolar (bullying)', severity: 'muy_grave', requiresDece: true, requiresCommitment: true, sortOrder: 6 },
] as const

export const BASE_ACTIVITY_TYPES = [
  { code: 'task', name: 'Tarea', sortOrder: 1 },
  { code: 'lesson', name: 'Lección', sortOrder: 2 },
  { code: 'quiz', name: 'Prueba', sortOrder: 3 },
  { code: 'exam', name: 'Examen', sortOrder: 4 },
  { code: 'project', name: 'Proyecto', sortOrder: 5 },
  { code: 'participation', name: 'Participación', sortOrder: 6 },
  { code: 'reinforcement', name: 'Refuerzo', sortOrder: 7 },
  { code: 'other', name: 'Otro', sortOrder: 8 },
] as const

// Plantilla de anamnesis por defecto (alineada al Ministerio): editable por institución
export const DEFAULT_ANAMNESIS_SCHEMA = {
  sections: [
    {
      title: 'Datos de nacimiento',
      fields: [
        { key: 'tipo_parto', label: 'Tipo de parto', type: 'select', required: false, options: ['Normal', 'Cesárea'] },
        { key: 'semanas_gestacion', label: 'Semanas de gestación', type: 'text', required: false },
        { key: 'complicaciones_parto', label: 'Complicaciones en el parto', type: 'textarea', required: false },
      ],
    },
    {
      title: 'Salud',
      fields: [
        { key: 'tipo_sangre', label: 'Tipo de sangre', type: 'text', required: false },
        { key: 'alergias', label: 'Alergias', type: 'textarea', required: false },
        { key: 'enfermedades_cronicas', label: 'Enfermedades crónicas', type: 'textarea', required: false },
        { key: 'medicacion_actual', label: 'Medicación actual', type: 'textarea', required: false },
        { key: 'discapacidad', label: '¿Tiene alguna discapacidad?', type: 'checkbox', required: false },
        { key: 'discapacidad_detalle', label: 'Detalle de la discapacidad', type: 'textarea', required: false },
      ],
    },
    {
      title: 'Desarrollo',
      fields: [
        { key: 'edad_camino', label: 'Edad en que caminó', type: 'text', required: false },
        { key: 'edad_hablo', label: 'Edad en que habló', type: 'text', required: false },
        { key: 'dificultades_aprendizaje', label: 'Dificultades de aprendizaje', type: 'textarea', required: false },
      ],
    },
    {
      title: 'Entorno familiar',
      fields: [
        { key: 'vive_con', label: 'Vive con', type: 'text', required: false },
        { key: 'num_hermanos', label: 'Número de hermanos', type: 'text', required: false },
        { key: 'observaciones', label: 'Observaciones', type: 'textarea', required: false },
      ],
    },
  ],
} as const

// Plantilla PCA (Planificación Curricular Anual) por defecto, editable por institución.
export const DEFAULT_PCA_SCHEMA = {
  sections: [
    {
      title: 'Datos generales',
      fields: [
        {
          key: 'ejes_transversales',
          label: 'Ejes transversales',
          type: 'textarea',
          required: false,
          placeholder: 'Ej: Educación para la ciudadanía, cuidado del medio ambiente, valores institucionales...',
        },
        {
          key: 'objetivos_generales',
          label: 'Objetivos generales del área/asignatura',
          type: 'textarea',
          required: true,
          placeholder: 'Ej: Desarrollar el pensamiento lógico-matemático mediante la resolución de problemas cotidianos.',
        },
      ],
    },
    {
      title: 'Metodología y evaluación',
      fields: [
        {
          key: 'metodologia',
          label: 'Orientaciones metodológicas',
          type: 'textarea',
          required: false,
          placeholder: 'Ej: Aprendizaje basado en problemas, trabajo colaborativo en grupos pequeños...',
        },
        {
          key: 'evaluacion',
          label: 'Criterios generales de evaluación',
          type: 'textarea',
          required: false,
          placeholder: 'Ej: Evaluación formativa continua, portafolio de evidencias, pruebas por trimestre...',
        },
        {
          key: 'bibliografia',
          label: 'Bibliografía / recursos',
          type: 'textarea',
          required: false,
          placeholder: 'Ej: Texto oficial del MINEDUC 5to EGB, material concreto, recursos TIC...',
        },
      ],
    },
  ],
} as const

// NOTA: ya no existe DEFAULT_PUD_SCHEMA — la microplanificación (LearningSituation +
// PlanningWeek) tiene estructura FIJA para reproducir el formato oficial institucional
// "Planificación Microcurricular" (situación de aprendizaje + semanas con saberes
// declarativo/procedimental/actitudinal + 3 momentos DUA), no una plantilla configurable.

// Configuración de calificación por defecto (escala MINEDUC), editable por el admin
export const DEFAULT_GRADING_CONFIG = {
  // Escala numérica general de la institución (por ejemplo, notas sobre 5 o sobre 10).
  gradingScaleMax: 10,
  qualitativeScale: [
    { min: 9.0, max: 10.0, code: 'DAR', label: 'Domina los aprendizajes requeridos' },
    { min: 7.0, max: 8.99, code: 'AAR', label: 'Alcanza los aprendizajes requeridos' },
    { min: 4.01, max: 6.99, code: 'PAAR', label: 'Está próximo a alcanzar los aprendizajes requeridos' },
    { min: 0, max: 4.0, code: 'NAAR', label: 'No alcanza los aprendizajes requeridos' },
  ],
  behaviorScale: [
    { code: 'A', label: 'Muy satisfactorio' },
    { code: 'B', label: 'Satisfactorio' },
    { code: 'C', label: 'Poco satisfactorio' },
    { code: 'D', label: 'Mejorable' },
    { code: 'E', label: 'Insatisfactorio' },
  ],
  // Escala de VALOR (con +/−) para traducir la nota numérica de las materias
  // cualitativas a una letra en la libreta. Configurable por institución.
  qualitativeValueScale: [
    { min: 9.5, max: 10.0, code: 'A+' },
    { min: 9.0, max: 9.49, code: 'A-' },
    { min: 8.0, max: 8.99, code: 'B+' },
    { min: 7.0, max: 7.99, code: 'B-' },
    { min: 6.0, max: 6.99, code: 'C+' },
    { min: 5.0, max: 5.99, code: 'C-' },
    { min: 4.51, max: 4.99, code: 'D+' },
    { min: 4.01, max: 4.5, code: 'D-' },
    { min: 2.67, max: 4.0, code: 'E+' },
    { min: 1.34, max: 2.66, code: 'E-' },
    { min: 0, max: 1.33, code: 'F-' },
  ],
  promotion: {
    minToPass: 7.0,
    supletorioMin: 5.0,
    supletorioMax: 6.99,
    passWithExam: 7.0,
    maxFailedSubjects: 1,
  },
  defaultExamWeight: 30,
  pedagogicRecovery: {
    mode: 'replace_if_higher' as const,
  },
} as const

// Materias cualitativas por defecto (se califican con notas; en la libreta se
// muestran como letra A+…F− y no entran al promedio general).
export const DEFAULT_QUALITATIVE_SUBJECTS = [
  'Cívica y acompañamiento integral en el aula',
  'Animación a la lectura',
] as const

// Asistente IA de planificaciones — apagado por defecto, el admin lo activa
// explícitamente desde Configuración. Modelo barato por defecto (tarea de
// completar plantilla, no razonamiento profundo).
export const DEFAULT_AI_CONFIG = {
  enabled: false,
  model: 'claude-haiku-4-5',
  monthlyTokenCap: 2_000_000,
} as const

export interface BootstrapAdminInput {
  email: string
  firstName: string
  lastName: string
  password: string
}

export interface BootstrapInstitutionResult {
  institutionId: string
  adminUserId: string
}

/**
 * Crea una institución NUEVA con toda su configuración por defecto:
 * roles del sistema, permisos, asignación de permisos a roles, esquema de
 * periodos trimestral, niveles, tipos de actividad y el usuario admin inicial.
 *
 * Debe ejecutarse dentro de una transacción (`tx`) y asume que ni el código de
 * institución ni el email del admin existen aún (validar antes en el use-case).
 */
export async function bootstrapInstitution(
  tx: Prisma.TransactionClient,
  institution: { name: string; code: string },
  admin: BootstrapAdminInput,
): Promise<BootstrapInstitutionResult> {
  // 1. Institución (con configuración de calificación por defecto)
  const inst = await tx.institution.create({
    data: {
      name: institution.name,
      code: institution.code,
      settings: { gradingConfig: DEFAULT_GRADING_CONFIG } as unknown as Prisma.InputJsonValue,
    },
  })

  // 2. Roles del sistema
  const roleMap: Record<string, string> = {}
  for (const r of SYSTEM_ROLES) {
    const role = await tx.role.create({
      data: { name: r.name, label: r.label, isSystem: r.isSystem, institutionId: inst.id },
    })
    roleMap[r.name] = role.id
  }

  // 3. Permisos (globales, idempotentes vía upsert por la unique resource+action+scope)
  const permMap: Record<string, string> = {}
  for (const p of BASE_PERMISSIONS) {
    const perm = await tx.permission.upsert({
      where: { resource_action_scope: { resource: p.resource, action: p.action, scope: p.scope } },
      update: {},
      create: { resource: p.resource, action: p.action, scope: p.scope },
    })
    permMap[`${p.resource}:${p.action}:${p.scope}`] = perm.id
  }

  // 4. Asignación de permisos a roles
  for (const rp of ROLE_PERMISSIONS) {
    const roleId = roleMap[rp.roleName]
    const permId = permMap[rp.permKey]
    if (!roleId || !permId) continue
    await tx.rolePermission.create({ data: { roleId, permissionId: permId } })
  }

  // 5. Esquema de periodos trimestral (por defecto)
  await tx.academicPeriodScheme.create({
    data: {
      institutionId: inst.id,
      name: 'Trimestral',
      code: 'trimester',
      periodsCount: 3,
      isDefault: true,
    },
  })

  // 6. Niveles educativos
  await tx.level.createMany({
    data: DEFAULT_LEVELS.map((l) => ({ ...l, institutionId: inst.id })),
  })

  // 7. Tipos de actividad base
  await tx.activityType.createMany({
    data: BASE_ACTIVITY_TYPES.map((t) => ({ ...t, institutionId: inst.id })),
  })

  // 7b. Tipos de falta base (debido proceso)
  await tx.incidentType.createMany({
    data: DEFAULT_INCIDENT_TYPES.map((t) => ({ ...t, institutionId: inst.id })),
  })

  // 7c. Plantilla de anamnesis por defecto
  await tx.anamnesisTemplate.create({
    data: {
      institutionId: inst.id,
      name: 'Ficha de anamnesis',
      isDefault: true,
      schema: DEFAULT_ANAMNESIS_SCHEMA as unknown as Prisma.InputJsonValue,
    },
  })

  // 7c-ter. Plantilla de PCA por defecto
  await tx.planningTemplate.create({
    data: {
      institutionId: inst.id,
      type: 'pca',
      name: 'PCA — Planificación Curricular Anual',
      isDefault: true,
      schema: DEFAULT_PCA_SCHEMA as unknown as Prisma.InputJsonValue,
    },
  })

  // 7c-bis. Banco curricular MINEDUC (Currículo Priorizado con Énfasis en Competencias)
  const defaultCurriculum = loadDefaultCurriculum()
  for (const area of defaultCurriculum) {
    const createdArea = await tx.curriculumArea.create({
      data: { institutionId: inst.id, code: area.code, name: area.name },
    })
    for (const [subnivel, criteria] of Object.entries(area.subniveles)) {
      for (const criterion of criteria) {
        const createdCriterion = await tx.curriculumCriterion.create({
          data: {
            areaId: createdArea.id,
            subnivel,
            code: criterion.code,
            description: criterion.description,
          },
        })
        if (criterion.skills.length) {
          await tx.curriculumSkill.createMany({
            data: criterion.skills.map((skill) => ({
              criterionId: createdCriterion.id,
              code: skill.code,
              description: skill.description,
              indicatorText: skill.indicatorText,
              profileRefs: skill.profileRefs,
              competencyTags: [] as string[],
              insercionTags: [] as string[],
            })),
          })
        }
      }
    }
  }

  // 7c-quater. Banco curricular por COMPETENCIAS (CNC-MINEDUC) — modelo
  // alternativo al de destrezas, se siembra siempre; solo se usa si la
  // institución activa planningModel = "competencias" desde Configuración.
  const defaultCompetencies = loadDefaultCompetencies()
  for (const area of defaultCompetencies) {
    const createdArea = await tx.competencyArea.create({
      data: { institutionId: inst.id, code: area.code, name: area.name },
    })
    for (const [subnivel, competencies] of Object.entries(area.subniveles)) {
      for (const competency of competencies) {
        const createdCompetency = await tx.competency.create({
          data: {
            areaId: createdArea.id,
            subnivel,
            code: competency.code,
            text: competency.text,
            keyCompetencyCodes: competency.keyCompetencyCodes,
          },
        })
        if (competency.indicators.length) {
          await tx.competencyIndicator.createMany({
            data: competency.indicators.map((ind) => ({
              competencyId: createdCompetency.id,
              code: ind.code,
              text: ind.text,
            })),
          })
        }
        if (competency.sabers.length) {
          await tx.competencySaber.createMany({
            data: competency.sabers.map((saber) => ({
              competencyId: createdCompetency.id,
              type: saber.type,
              code: saber.code,
              description: saber.description,
            })),
          })
        }
      }
    }
  }

  // 7d. Materias cualitativas por defecto (libreta)
  await tx.subject.createMany({
    data: DEFAULT_QUALITATIVE_SUBJECTS.map((name) => ({
      institutionId: inst.id,
      name,
      isQualitative: true,
    })),
  })

  // 8. Usuario admin inicial
  const passwordHash = await bcrypt.hash(admin.password, 12)
  const adminUser = await tx.user.create({
    data: {
      institutionId: inst.id,
      email: admin.email,
      passwordHash,
      profile: { create: { firstName: admin.firstName, lastName: admin.lastName } },
    },
  })
  await tx.userRole.create({ data: { userId: adminUser.id, roleId: roleMap['admin'] } })

  return { institutionId: inst.id, adminUserId: adminUser.id }
}
