import { describe, expect, it } from 'vitest'
import { boardConfig, boardConfigSchema, DEFAULT_BOARD_CONFIG, reportInputSchema } from './course-board-config'

describe('simple course board configuration', () => {
  it('provides three optional report types and independent default copies', () => {
    const cfg = boardConfig({})
    expect(cfg.reportTypes.map((t) => t.key)).toEqual(['general', 'subject', 'reinforcement'])
    cfg.reportTypes[0].label = 'Changed'
    expect(boardConfig({}).reportTypes[0].label).toBe(DEFAULT_BOARD_CONFIG.reportTypes[0].label)
  })
  it('keeps institutional labels and custom report types', () => {
    const cfg = { ...DEFAULT_BOARD_CONFIG, situationLabel: 'Hallazgos', showIncidents: false, reportTypes: [{ key: 'custom', label: 'Informe institucional', enabled: true, authors: 'both' }] }
    expect(boardConfig({ courseBoards: cfg })).toEqual(cfg)
  })
  it('rejects repeated keys, empty labels and unknown authors', () => {
    expect(boardConfigSchema.safeParse({ ...DEFAULT_BOARD_CONFIG, reportTypes: [DEFAULT_BOARD_CONFIG.reportTypes[0], DEFAULT_BOARD_CONFIG.reportTypes[0]] }).success).toBe(false)
    expect(boardConfigSchema.safeParse({ ...DEFAULT_BOARD_CONFIG, title: ' ' }).success).toBe(false)
    expect(boardConfigSchema.safeParse({ ...DEFAULT_BOARD_CONFIG, reportTypes: [{ key: 'custom', label: 'Report', authors: 'anyone', enabled: true }] }).success).toBe(false)
  })
  it('requires only the situation for a report; additional text is optional', () => {
    expect(reportInputSchema.parse({ typeKey: 'general', situation: ' Observación ' })).toEqual({ typeKey: 'general', situation: 'Observación', actions: '', recommendations: '' })
    expect(reportInputSchema.safeParse({ typeKey: 'general', situation: ' ' }).success).toBe(false)
  })
})
