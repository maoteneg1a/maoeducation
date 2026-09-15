/**
 * Catálogo de módulos activables por institución.
 *
 * Los módulos se agrupan en dos productos con unidades de valor distintas:
 *  - "docencia": lo que el docente prepara por su cuenta. El valor (y el costo
 *    de IA) escala con docentes, no con alumnos.
 *  - "institucional": la gestión académica de la escuela. Escala con alumnos.
 *
 * Es el mismo agrupamiento que ve el usuario en el sidebar.
 *
 * ALL_MODULES se DERIVA de los grupos a propósito: antes era una lista aparte y
 * los módulos de planificación quedaron fuera del catálogo aunque el sidebar ya
 * gateaba sobre ellos. Resultado: el diálogo de módulos del panel de superadmin
 * no podía activarlos y, al guardar, escribía un arreglo sin ellos — apagando
 * planificación en silencio. Un solo origen evita que vuelva a pasar.
 */

const DOCENCIA_MODULES = [
  'planning',
  'interdisciplinary_projects',
  'reinforcement_plans',
] as const

const INSTITUCIONAL_MODULES = [
  'users',
  'roles',
  'academic',
  'enrollment',
  'anamnesis',
  'activities',
  'grades',
  'behavior',
  'pedagogic_recovery',
  'promotion',
  'attendance',
  'incidents',
  'parent_meetings',
  'student_folder',
  'messages',
  'tasks',
  'calendar',
  'schedules',
  'reports',
  'branding',
] as const

export const ALL_MODULES = [...DOCENCIA_MODULES, ...INSTITUCIONAL_MODULES] as const

export type ModuleKey = (typeof ALL_MODULES)[number]

export type ModuleGroupId = 'docencia' | 'institucional'

export interface ModuleGroup {
  id: ModuleGroupId
  label: string
  description: string
  modules: readonly ModuleKey[]
}

export const MODULE_GROUPS: readonly ModuleGroup[] = [
  {
    id: 'docencia',
    label: 'Planificación docente',
    description: 'Lo que el docente prepara antes de la clase.',
    modules: DOCENCIA_MODULES,
  },
  {
    id: 'institucional',
    label: 'Gestión institucional',
    description: 'Administración académica de la escuela.',
    modules: INSTITUCIONAL_MODULES,
  },
]

export const MODULE_LABELS: Record<ModuleKey, string> = {
  // Planificación docente
  planning: 'Planificaciones',
  interdisciplinary_projects: 'Proyectos Interdisciplinarios',
  reinforcement_plans: 'Refuerzo y Adaptaciones',
  // Gestión institucional
  users: 'Usuarios',
  roles: 'Roles y Permisos',
  academic: 'Configuración Académica',
  enrollment: 'Matrículas',
  anamnesis: 'Ficha de Anamnesis',
  activities: 'Actividades',
  grades: 'Calificaciones',
  behavior: 'Comportamiento',
  pedagogic_recovery: 'Recuperación Pedagógica',
  promotion: 'Promoción',
  attendance: 'Asistencia',
  incidents: 'Incidentes',
  parent_meetings: 'Atención a Padres',
  student_folder: 'Carpeta del Estudiante',
  messages: 'Mensajes',
  tasks: 'Tareas',
  calendar: 'Calendario',
  schedules: 'Horario',
  reports: 'Reportes',
  branding: 'Personalización',
}

/**
 * Módulos habilitados por defecto para cuentas personales de profesores.
 *
 * Incluye TODO el grupo de docencia: es la razón por la que un docente abre una
 * cuenta personal. Antes esta lista no tenía los módulos de planificación, así
 * que el producto quedaba oculto justo para ese público.
 *
 * Mantener en sync con PERSONAL_DEFAULT_MODULES en
 * apps/api/src/modules/personal/presentation/personal.routes.ts
 */
export const PERSONAL_DEFAULT_MODULES: ModuleKey[] = [
  ...DOCENCIA_MODULES,
  'academic',
  'enrollment',
  'activities',
  'grades',
  'attendance',
  'reports',
  'branding',
]
