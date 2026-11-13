import { z } from 'zod'

export const boardConfigSchema = z.object({
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
