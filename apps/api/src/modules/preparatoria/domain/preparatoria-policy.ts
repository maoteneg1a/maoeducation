import { z } from 'zod'
import catalog from './catalog.json'

export const AXES = [
  { id: 'personal', name: 'Personal, social y cultural' },
  { id: 'discovery', name: 'Descubrimiento del medio natural' },
  { id: 'expression', name: 'Expresión y comunicación' },
] as const

export const AMBITS = [
  { id: 'identity', name: 'Identidad y autonomía', axis: 'personal' },
  { id: 'coexistence', name: 'Convivencia', axis: 'personal' },
  { id: 'environment', name: 'Descubrimiento y comprensión del medio natural y cultural', axis: 'discovery' },
  { id: 'math', name: 'Relaciones lógico-matemáticas', axis: 'discovery' },
  { id: 'language', name: 'Comprensión y expresión oral y escrita', axis: 'expression' },
  { id: 'artistic', name: 'Comprensión y expresión artística', axis: 'expression' },
  { id: 'body', name: 'Expresión corporal', axis: 'expression' },
] as const
export type AmbitId = typeof AMBITS[number]['id']
export interface CatalogItem { key: string; code: string; text: string; ambit: AmbitId; competencyCode: string; competencyText: string }
export const CATALOG = { ...catalog, items: catalog.items.map(item => ({ ...item, text: item.text.startsWith(item.code) ? item.text.slice(item.code.length).replace(/^[.\s]+/, '') : item.text })) } as { version: string; source: string; items: CatalogItem[] }

export interface PreparatoryCompetency {
  key: string
  code: string
  text: string
  ambit: AmbitId
  indicators: { key: string; code: string; text: string }[]
}

const defaultAmbits = new Map(CATALOG.items.map(item => [item.competencyCode, item.ambit]))

export function preparatoryCompetencies(indicators: CatalogItem[]): PreparatoryCompetency[] {
  const byCode = new Map<string, CatalogItem[]>()
  for (const indicator of indicators) {
    const group = byCode.get(indicator.competencyCode)
    if (group) group.push(indicator)
    else byCode.set(indicator.competencyCode, [indicator])
  }
  return [...byCode].map(([code, group]) => {
    const [first] = group
    // Las distribuciones anteriores podían repartir los indicadores de una misma competencia.
    const ambit = group.every(indicator => indicator.ambit === first.ambit)
      ? first.ambit : defaultAmbits.get(code) ?? first.ambit
    return {
      key: code, code, text: first.competencyText, ambit,
      indicators: group.map(({ key, code, text }) => ({ key, code, text })),
    }
  })
}

export const CODES = ['A+', 'A-', 'B+', 'B-', 'C+', 'C-', 'D+', 'D-', 'E+', 'E-', 'NE'] as const
export function scaleFor(version: string) {
  return CODES.map(code => ({ code, label: code === 'NE' ? 'No trabajado en este período' :
    (code.startsWith('A') || code === 'B+' || (version === '2026-00082A' && code === 'B-')) ? 'Aprendizaje alcanzado' :
    (code.startsWith('C') || code === 'B-') ? 'Aprendizaje en proceso de desarrollo' : 'Aprendizaje iniciado' }))
}
export const contextSchema = z.object({ parallelId: z.string().min(1), periodId: z.string().min(1).optional() })
const revision = z.number().int().min(1)
const ambit = z.enum(['identity', 'coexistence', 'environment', 'math', 'language', 'artistic', 'body'])
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
