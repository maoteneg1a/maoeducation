export interface InstitutionBranding {
  logoUrl?: string | null
  primaryColor?: string | null // HSL string, ej. "221 83% 53%"
  sidebarColor?: string | null // HSL string
}

export interface InstitutionSettingsDto {
  id: string
  name: string
  code: string
  branding: InstitutionBranding
}

export interface UpdateInstitutionSettingsDto {
  name?: string
  branding?: InstitutionBranding
}

// ---- Configuración de calificación (MINEDUC, parametrizable) ----

export interface QualitativeLevel {
  min: number
  max: number
  code: string
  label: string
}

export interface BehaviorLevel {
  code: string
  label: string
}

export interface PromotionConfig {
  minToPass: number // nota mínima para aprobar (ej. 7)
  supletorioMin: number // desde (inclusive) → va a supletorio
  supletorioMax: number // hasta (inclusive) → va a supletorio
  passWithExam: number // nota con la que aprueba tras el supletorio
  maxFailedSubjects: number // materias reprobadas permitidas antes de repetir
}

export interface PedagogicRecoveryConfig {
  /** Cómo se aplica la nota de recuperación al total del período:
   *  - replace_if_higher: reemplaza si es mayor (MINEDUC estándar)
   *  - average: promedia nota original + recuperación */
  mode: 'replace_if_higher' | 'average'
}

export interface GradingConfig {
  gradingScaleMax: number
  qualitativeScale: QualitativeLevel[]
  behaviorScale: BehaviorLevel[]
  promotion: PromotionConfig
  defaultExamWeight: number
  pedagogicRecovery: PedagogicRecoveryConfig
}

export interface UpdateGradingConfigDto {
  gradingScaleMax?: number
  qualitativeScale?: QualitativeLevel[]
  behaviorScale?: BehaviorLevel[]
  promotion?: Partial<PromotionConfig>
  defaultExamWeight?: number
  pedagogicRecovery?: Partial<PedagogicRecoveryConfig>
}

// ---- Asistente IA de planificaciones (configurable por institución) ----

export interface AiConfig {
  /** El admin debe activarlo explícitamente — apagado por defecto. */
  enabled: boolean
  model: string
  /** Tope mensual de tokens (input+output) para esta institución. 0 = sin tope. */
  monthlyTokenCap: number
}

export interface UpdateAiConfigDto {
  enabled?: boolean
  model?: string
  monthlyTokenCap?: number
}

// ---- Modelo de planificación curricular (configurable por institución) ----

export type PlanningModel = 'destrezas' | 'competencias'

export interface UpdatePlanningModelDto {
  planningModel: PlanningModel
}

// ---- Plantilla de documento — Planificación Microcurricular (configurable por institución) ----
// Cada institución pide su propio formato (colores, marca de agua, nombres de fase,
// orden de saberes/secciones) — antes esto significaba editar código; ahora es config.

export type SaberType = 'declarativo' | 'procedimental' | 'actitudinal'
export type WeekLayout = 'table_per_week' | 'rows_in_single_table'

export interface PhaseLabels {
  anticipacion: string
  construccionConocimiento: string
  consolidacion: string
}

/** Alcance de la marca de agua en el documento generado:
 *  - all_pages: se repite en cada página (se escucha 'pageAdded' de PDFKit).
 *  - first_page_only: solo en la primera página — comportamiento histórico,
 *    antes de que esto fuera configurable (ver microcurricular-pdf.service.ts). */
export type WatermarkScope = 'all_pages' | 'first_page_only'

export interface MicrocurricularTemplateConfig {
  /** Fondo del encabezado superior (nombre de institución + año lectivo). */
  topHeaderColor: string
  /** Color de texto del encabezado superior. */
  topHeaderTextColor: string
  /** Fondo de las bandas de sección genéricas (Datos informativos, Situación de
   *  aprendizaje, Conexión interdisciplinar, SEMANAS, título "Saberes"...). */
  headerColor: string
  /** Color de texto sobre `headerColor`. */
  headerTextColor: string
  /** Fondo de los sub-encabezados (tabla de saberes: Indicadores/D/P/A; tabla de
   *  metodología semanal por semana/filas; pie de firmas). */
  headerColor2: string
  /** Color de texto sobre `headerColor2`. */
  headerColor2TextColor: string
  watermarkEnabled: boolean
  /** Opacidad de la marca de agua, de 0 a 1. */
  watermarkOpacity: number
  watermarkScope: WatermarkScope
  phaseLabels: PhaseLabels
  saberesOrder: SaberType[]
  weekLayout: WeekLayout
  sectionOrder: string[]
  hiddenSections: string[]
  /** Imagen de encabezado completa subida por la institución (banner ya diseñado:
   *  fondo, ondas, logo, nombre, caja de datos institucionales, etc. — diseño
   *  gráfico libre que no se puede replicar con controles paramétricos). Si está
   *  configurada, reemplaza el bloque superior (logo pequeño + nombre en texto)
   *  del PDF, dibujándose a ancho completo de página. `null`/vacío = sin banner,
   *  se mantiene el encabezado por defecto. */
  headerBannerUrl: string | null
}

export interface UpdateMicrocurricularTemplateDto {
  topHeaderColor?: string
  topHeaderTextColor?: string
  headerColor?: string
  headerTextColor?: string
  headerColor2?: string
  headerColor2TextColor?: string
  watermarkEnabled?: boolean
  watermarkOpacity?: number
  watermarkScope?: WatermarkScope
  phaseLabels?: Partial<PhaseLabels>
  saberesOrder?: SaberType[]
  weekLayout?: WeekLayout
  sectionOrder?: string[]
  hiddenSections?: string[]
  headerBannerUrl?: string | null
}
