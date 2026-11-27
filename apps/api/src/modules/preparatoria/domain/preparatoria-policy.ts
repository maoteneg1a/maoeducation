import { z } from 'zod'
import catalog from './catalog.json'

export const AMBITS = [
  { id: 'identity', name: 'Identidad y autonomía' },
  { id: 'coexistence', name: 'Convivencia' },
  { id: 'environment', name: 'Descubrimiento y comprensión del medio natural y cultural' },
  { id: 'math', name: 'Relaciones lógico-matemáticas' },
  { id: 'language', name: 'Comprensión y expresión oral y escrita' },
  { id: 'artistic', name: 'Comprensión y expresión artística' },
  { id: 'body', name: 'Expresión corporal' },
  { id: 'project', name: 'Proyecto' },
] as const
export type AmbitId = typeof AMBITS[number]['id']
export interface CatalogItem { key: string; code: string; text: string; ambit: AmbitId; competencyCode: string; competencyText: string }
const projectIndicator: CatalogItem = {
  key: 'PROYECTO',
  code: 'PROYECTO',
  text: 'Proyecto',
  ambit: 'project',
  competencyCode: 'PROYECTO',
  competencyText: 'Proyecto',
}
export const CATALOG = { ...catalog, items: [
  ...catalog.items.map(item => ({ ...item, text: item.text.startsWith(item.code) ? item.text.slice(item.code.length).replace(/^[.\s]+/, '') : item.text })),
  projectIndicator,
] } as { version: string; source: string; items: CatalogItem[] }

// Selección institucional entregada para el primer trimestre de UEEU 2026–2027.
export const UEEU_FIRST_TERM_INDICATOR_KEYS = [
  'I.CI.1.1.1',
  'I.CI.0.9.26',
  'I.CI.0.9.27',
  'I.CI.0.9.28',
  'I.CI.1.2.1',
  'I.CI.1.2.2',
  'I.CI.1.8.1',
  'I.CI.1.8.2',
  'I.CI.1.8.3',
  'I.CI.1.13.1',
  'I.CI.1.13.2',
  'I.CI.1.13.3',
  'I.CI.1.13.4',
  'I.CI.1.14.1',
  'I.CI.1.15.1',
  'I.CI.1.15.2',
  'I.CI.1.15.3',
  'I.CI.1.18.1',
  'I.CI.1.18.2',
  'I.CI.1.21.1',
  'I.CI.1.21.2',
  'I.CI.1.22.1',
  'I.CI.1.22.2',
  'I.CI.1.23.1',
  'I.CI.1.23.2',
  'PROYECTO',
] as const

const defaultCompetencyAmbits = new Map(CATALOG.items.map(item => [item.competencyCode, item.ambit]))

/** Reconstruye las etiquetas y los permisos de las competencias ya valoradas. */
export function historicalCompetencies(indicators: CatalogItem[]): CatalogItem[] {
  const byCode = new Map<string, CatalogItem>()
  for (const indicator of indicators) {
    const code = indicator.competencyCode
    const current = byCode.get(code)
    if (!current) {
      byCode.set(code, { ...indicator, key: code, code, text: indicator.competencyText })
    } else if (current.ambit !== indicator.ambit) {
      current.ambit = defaultCompetencyAmbits.get(code) ?? current.ambit
    }
  }
  return [...byCode.values()]
}

export const CODES = ['A+', 'A-', 'B+', 'B-', 'C+', 'C-', 'D+', 'D-', 'E+', 'E-', 'NE'] as const
export function scaleFor(version: string) {
  return CODES.map(code => ({ code, label: code === 'NE' ? 'No trabajado en este período' :
    (code.startsWith('A') || code === 'B+' || (version === '2026-00082A' && code === 'B-')) ? 'Aprendizaje alcanzado' :
    (code.startsWith('C') || code === 'B-') ? 'Aprendizaje en proceso de desarrollo' : 'Aprendizaje iniciado' }))
}
export const contextSchema = z.object({ parallelId: z.string().min(1), periodId: z.string().min(1).optional() })
const revision = z.number().int().min(1)
const ambit = z.enum(['identity', 'coexistence', 'environment', 'math', 'language', 'artistic', 'body', 'project'])
export const configureSchema = z.object({
  expectedRevision: revision, enabled: z.boolean(), reviewed: z.literal(true),
  scaleVersion: z.enum(['2026-00082A', '2025-INSTRUCTIVO']),
  ambitTeachers: z.record(z.string().min(1)),
  distribution: z.array(z.object({ key: z.string(), ambit }).strict()).max(500),
}).strict()
export const selectionSchema = z.object({ expectedRevision: revision, itemKeys: z.array(z.string()).max(500) }).strict()
export const valuesSchema = z.object({
  expectedRevision: revision,
  values: z.array(z.object({ studentId: z.string().min(1), itemKey: z.string().min(1), code: z.enum(CODES).nullable(), notes: z.string().max(2000).default('') }).strict()).max(2500),
  comments: z.array(z.object({ studentId: z.string().min(1), text: z.string().max(4000) }).strict()).max(300).default([]),
}).strict()
export function isPreparatoryLevel(level: { code: string; subnivel: string | null }) {
  return level.code.trim().toUpperCase() === '1B'
}
export function uniqueKeys(keys: string[]): boolean { return new Set(keys).size === keys.length }
