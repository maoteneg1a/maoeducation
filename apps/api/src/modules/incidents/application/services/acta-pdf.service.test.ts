import { describe, expect, it } from 'vitest'
import { inflateSync } from 'node:zlib'
import { buildActaPdf } from './acta-pdf.service'
import { sampleActaPdfData } from './acta-preview'
import { DEFAULT_ACTA_TEMPLATE } from './commitment-document'

// Inspeccionar los flujos permite verificar contenido y paginación sin depender de un visor externo.
function streams(pdf: Buffer) {
  const source = pdf.toString('latin1')
  return [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
    try { return inflateSync(Buffer.from(match[1], 'latin1')).toString() } catch { return '' }
  }).filter((stream) => stream.includes('BT'))
}
function text(stream: string) {
  return [...stream.matchAll(/\[([^\]]*)\] TJ/g)].map((match) => [...match[1].matchAll(/<([a-f0-9]+)>/gi)].map((part) => Buffer.from(part[1], 'hex').toString('latin1')).join('')).join('\n')
}

describe('PDF de actas detalladas', () => {
  it('genera páginas numeradas con narrativa, acuerdos, bitácora y firmas', async () => {
    const data = sampleActaPdfData('Escuela de prueba', null, DEFAULT_ACTA_TEMPLATE)
    const pdf = await buildActaPdf(data)
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    const pages = streams(pdf)
    expect(pages).toHaveLength(2)
    const content = text(pages.join(''))
    expect(content).toContain('Estudiante de ejemplo')
    expect(content).toContain('Responsable')
    expect(content).toContain('registro-de-ejemplo.pdf')
    expect(content).not.toContain('low')
    for (const page of pages) expect(text(page)).toContain('VISTA-PREVIA')
  })
  it('admite textos extensos y veinte participantes sin páginas vacías', async () => {
    const data = sampleActaPdfData('Escuela de prueba', null, DEFAULT_ACTA_TEMPLATE)
    data.document!.context.description = 'Relato detallado del incidente y las actuaciones realizadas. '.repeat(180)
    data.document!.details.participants = Array.from({ length: 20 }, (_, index) => ({ name: `Participante ${index + 1}`, role: 'Integrante de la reunión' }))
    data.document!.details.agreements[0].action = 'Se registran las acciones de acompañamiento acordadas. '.repeat(70)
    const pdf = await buildActaPdf(data)
    const pages = streams(pdf)
    expect(pages.length).toBeGreaterThan(5)
    expect(pages.length).toBeLessThan(20)
    for (const page of pages) expect((page.match(/\bBT\b/g) ?? []).length).toBeGreaterThan(3)
  })
  it('mantiene compatible la descarga del contenido básico anterior', async () => {
    const data = sampleActaPdfData('Escuela', null, DEFAULT_ACTA_TEMPLATE)
    delete data.document
    const pdf = await buildActaPdf(data)
    expect(text(streams(pdf).join(''))).toContain('Estudiante de ejemplo')
  })
})
