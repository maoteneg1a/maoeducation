import { AMBITS, type AmbitId } from './preparatoria-policy'

const workbookAmbits = [
  { id: 'personal', name: 'Ámbito 1 · Personal Social y Cultural' },
  { id: 'discovery', name: 'Ámbito 2 · Descubrimiento del Medio Natural' },
  { id: 'expression', name: 'Ámbito 3 · Expresión y Comunicación' },
] as const

type WorkbookAmbit = typeof workbookAmbits[number]['id']

const byCurricularAmbit: Record<AmbitId, WorkbookAmbit> = {
  identity: 'personal',
  coexistence: 'personal',
  environment: 'discovery',
  math: 'discovery',
  language: 'expression',
  artistic: 'expression',
  body: 'expression',
}

// Encabezados combinados C13:M13 y códigos de la fila 14 en la lista de cotejo de la institución.
const workbookAssignments = new Map<string, WorkbookAmbit>([
  ['I.CI.1.13.1', 'personal'],
  ['I.CI.1.13.2', 'personal'],
  ['I.CI.1.13.4', 'personal'],
  ['I.CI.1.12.1', 'discovery'],
  ['I.CI.1.7.2', 'discovery'],
  ['I.CI.0.9.26', 'discovery'],
  ['I.CI.1.10.1', 'expression'],
])

export function preparatoryBulletinLayout(institutionCode: string, yearName: string) {
  const useWorkbook = institutionCode === 'UEEU' && yearName === '2026-2027'
  return {
    ambits: useWorkbook ? workbookAmbits : AMBITS,
    ambitFor(item: { code: string; ambit: AmbitId }) {
      return useWorkbook ? workbookAssignments.get(item.code) ?? byCurricularAmbit[item.ambit] : item.ambit
    },
  }
}
