import { z } from 'zod'

export const DEFAULT_CONVOCATION_BACKGROUND = 'LOEI. Art. 18 Obligaciones de los docentes. d. Elaborar su planificación académica anual y presentarla oportunamente a las autoridades de la institución educativa y a sus estudiantes.'
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const boardConfigSchema = z.object({
  secretaries: z.record(z.string().uuid()).default({}),
  convocationBackground: z.string().trim().max(4000).default(DEFAULT_CONVOCATION_BACKGROUND),
  headerBackground: color.default('#D9E2F3'), tableHeaderBackground: color.default('#B4C6E7'),
  textColor: color.default('#000000'), borderColor: color.default('#333333'),
  watermarkEnabled: z.boolean().default(true), watermarkOpacity: z.number().min(0).max(0.15).default(0.05),
  title: z.string().trim().min(1).max(120),
  situationLabel: z.string().trim().min(1).max(100),
  actionsLabel: z.string().trim().min(1).max(100),
  recommendationsLabel: z.string().trim().min(1).max(100),
  showAttendance: z.boolean(), showIncidents: z.boolean(), showReinforcement: z.boolean(),
  reportTypes: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,49}$/), label: z.string().trim().min(1).max(120),
    enabled: z.boolean(), authors: z.enum(['tutor', 'teacher', 'both']),
  })).min(1).max(12),
}).superRefine((cfg, ctx) => {
  if (new Set(cfg.reportTypes.map((t) => t.key)).size !== cfg.reportTypes.length) ctx.addIssue({ code: 'custom', message: 'Los tipos de informe no pueden repetirse' })
})
export type BoardConfig = z.infer<typeof boardConfigSchema>
export const DEFAULT_BOARD_CONFIG: BoardConfig = {
  secretaries: {},
  convocationBackground: DEFAULT_CONVOCATION_BACKGROUND,
  headerBackground: '#D9E2F3', tableHeaderBackground: '#B4C6E7', textColor: '#000000', borderColor: '#333333',
  watermarkEnabled: true, watermarkOpacity: 0.05,
  title: 'Junta de curso', situationLabel: 'Situación observada', actionsLabel: 'Acciones realizadas', recommendationsLabel: 'Recomendaciones',
  showAttendance: true, showIncidents: true, showReinforcement: true,
  reportTypes: [
    { key: 'general', label: 'Informe general de rendimiento', enabled: true, authors: 'tutor' },
    { key: 'subject', label: 'Informe de asignatura', enabled: true, authors: 'teacher' },
    { key: 'reinforcement', label: 'Informe después del refuerzo', enabled: true, authors: 'both' },
  ],
}
export function boardConfig(settings: unknown): BoardConfig {
  const raw = (settings as { courseBoards?: unknown } | null)?.courseBoards
  const parsed = boardConfigSchema.safeParse(raw)
  return parsed.success ? parsed.data : structuredClone(DEFAULT_BOARD_CONFIG)
}

export const reportInputSchema = z.object({
  typeKey: z.string().min(1).max(50), courseAssignmentId: z.string().min(1).optional(),
  situation: z.string().trim().min(1).max(6000), actions: z.string().trim().max(6000).default(''),
  recommendations: z.string().trim().max(6000).default(''),
})
export type BoardReportInput = z.infer<typeof reportInputSchema>
