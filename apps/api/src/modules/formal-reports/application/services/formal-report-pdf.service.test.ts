import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { buildFormalReportPdf } from './formal-report-pdf.service'
import { buildOriginalAnnexDocx } from './original-annex-document.service'
import { sampleReinforcementAnnexes } from './reinforcement-annex-preview'

const assets = path.resolve('assets/reinforcement-annexes')
const xmlText = (xml: string) => [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#123;/g, '{').replace(/&#125;/g, '}').replace(/&amp;/g, '&')).join('')

describe('anexos fieles al Word original', () => {
  it.each(sampleReinforcementAnnexes().map((data, index) => ({ data, number: index + 1 })))('conserva textos y formato del Anexo $number, excepto identidad y año parametrizados', async ({ data, number }) => {
    const manifest = JSON.parse(await readFile(path.join(assets, 'manifest.json'), 'utf8'))
    const original = await readFile(path.join(assets, 'original.docx'))
    expect(createHash('sha256').update(original).digest('hex')).toBe(manifest.sourceSha256)
    const empty = { ...data, authorName: '', recipientNames: [], institutionName: '', content: {}, snapshot: {}, sentAt: null }
    const output = await JSZip.loadAsync(await buildOriginalAnnexDocx(empty))
    const source = await JSZip.loadAsync(original)
    const unbrandedText = manifest.annexes[number].originalText
      .replace(/Escuela de Educación Básica “Panamá”|INSTITUCIÓN EDUCATIVA “PANAMÁ”/g, '________________')
      .replace(/2026[–-]\s*2027/g, '________________')
    expect(xmlText(await output.file('word/document.xml')!.async('string'))).toBe(unbrandedText)
    const changedParts = new Set(['word/document.xml', ...manifest.branding.headerParts, manifest.branding.headerRelationships, ...manifest.branding.logoParts])
    for (const [name, part] of Object.entries(source.files)) {
      if (!changedParts.has(name) && !part.dir) expect(await output.file(name)!.async('nodebuffer'), name).toEqual(await part.async('nodebuffer'))
    }
    expect(xmlText(await output.file('word/header1.xml')!.async('string'))).toBe('________________ SUBDIRECCIÓN ________________')
    for (const name of manifest.branding.logoParts) expect(output.file(name)).toBeNull()
    if (process.env.ANNEX_PREVIEW_DIR) {
      await mkdir(process.env.ANNEX_PREVIEW_DIR, { recursive: true })
      await writeFile(path.join(process.env.ANNEX_PREVIEW_DIR, `anexo-${number}-vacio.docx`), await buildOriginalAnnexDocx(empty))
    }
  })

  it.each(sampleReinforcementAnnexes().map((data, index) => ({ data, number: index + 1 })))('usa el nombre, logo y año institucionales en el Anexo $number', async ({ data, number }) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><rect width="400" height="80" fill="#2467ac"/></svg>'
    data.institutionName = 'Unidad Educativa Río & Sol'
    data.logoUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    data.snapshot.academicYear = { name: '2031-2032' }
    const docx = await buildOriginalAnnexDocx(data)
    const zip = await JSZip.loadAsync(docx)
    const header = await zip.file('word/header1.xml')!.async('string')
    expect(xmlText(header)).toBe('Unidad Educativa Río & Sol SUBDIRECCIÓN 2031-2032')
    const body = await zip.file('word/document.xml')!.async('string')
    expect(body + header).not.toMatch(/panamá|2026[–-]\s*2027|\{\{[a-z_0-9]+\}\}/i)
    for (const name of ['image1.png', 'image10.png']) {
      const image = await zip.file(`word/media/${name}`)!.async('nodebuffer')
      const dimensions = await sharp(image).metadata()
      expect(dimensions.format).toBe('png')
      expect(dimensions.width! / dimensions.height!).toBe(5)
    }
    const institutionalDrawing = header.match(/<wp:inline\b[\s\S]*?r:embed="rId1"[\s\S]*?<\/wp:inline>/)![0]
    const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(institutionalDrawing)!
    expect(Number(extent[1]) / Number(extent[2])).toBeCloseTo(5, 3)
    const source = await JSZip.loadAsync(await readFile(path.join(assets, 'original.docx')))
    expect(await zip.file('word/media/image2.png')!.async('nodebuffer')).toEqual(await source.file('word/media/image2.png')!.async('nodebuffer'))
    if (process.env.ANNEX_PREVIEW_DIR) {
      await mkdir(process.env.ANNEX_PREVIEW_DIR, { recursive: true })
      await writeFile(path.join(process.env.ANNEX_PREVIEW_DIR, `anexo-${number}-institucional.docx`), docx)
    }
  })

  it('mantiene aislada la identidad de instituciones que generan anexos consecutivamente', async () => {
    const data = sampleReinforcementAnnexes()[0]
    data.institutionName = 'Institución Uno'
    const first = await JSZip.loadAsync(await buildOriginalAnnexDocx(data))
    data.institutionName = 'Institución Dos'
    const second = await JSZip.loadAsync(await buildOriginalAnnexDocx(data))
    expect(xmlText(await first.file('word/header1.xml')!.async('string'))).toContain('Institución Uno')
    expect(xmlText(await second.file('word/header1.xml')!.async('string'))).not.toContain('Institución Uno')
  })

  it.each(['data:image/png;base64,aW52YWxpZA==', 'https://example.invalid/logo.png', '/uploads/../../secret', null])('no conserva el logo fuente cuando el logo institucional no es utilizable: %s', async (logoUrl) => {
    const data = { ...sampleReinforcementAnnexes()[0], logoUrl }
    const zip = await JSZip.loadAsync(await buildOriginalAnnexDocx(data))
    const header = await zip.file('word/header1.xml')!.async('string')
    expect(header).not.toMatch(/r:embed="rId[12]"/)
    expect(zip.file('word/media/image1.png')).toBeNull()
    expect(zip.file('word/media/image10.png')).toBeNull()
    expect(await zip.file('word/_rels/header1.xml.rels')!.async('string')).not.toMatch(/Id="rId[12]"/)
  })

  it.each(sampleReinforcementAnnexes().map((data, index) => ({ data, number: index + 1 })))('completa el Anexo $number sin añadir el formato genérico de informes', async ({ data, number }) => {
    const docx = await buildOriginalAnnexDocx(data)
    const zip = await JSZip.loadAsync(docx)
    const xml = await zip.file('word/document.xml')!.async('string')
    const text = xmlText(xml)
    expect(xml).not.toMatch(/\{\{[a-z_0-9]+\}\}/)
    expect(text).not.toContain('BORRADOR')
    expect(text).not.toContain('Sin folio (borrador)')
    expect(text).not.toContain('CONTENIDO')
    expect(text).not.toContain('Marco normativo del año')
    expect(text).toContain(number === 5 ? 'REGISTRO DE ASISTENCIA' : 'Estudiante de ejemplo')
    if (process.env.ANNEX_PREVIEW_DIR) {
      await mkdir(process.env.ANNEX_PREVIEW_DIR, { recursive: true })
      await writeFile(path.join(process.env.ANNEX_PREVIEW_DIR, `anexo-${number}.docx`), docx)
    }
  })

  it('conserva íntegros los nueve compromisos y la referencia normativa del documento', async () => {
    const zip = await JSZip.loadAsync(await buildOriginalAnnexDocx(sampleReinforcementAnnexes()[1]))
    const text = xmlText(await zip.file('word/document.xml')!.async('string'))
    expect(text).toContain('Acuerdo Ministerial 0031A.Art. 3 literal j')
    expect(text).toContain('Autorizar la asistencia al refuerzo pedagógico según el horario establecido por inspección en coordinación con el docente.')
    expect(text).toContain('Valorar siempre el esfuerzo y la superación de dificultades y limitaciones en su trabajo.')
    expect(text).toContain('SUBDIRECTORA')
  })

  it('incluye varios alumnos en el Anexo 1 y amplía sus renglones originales cuando se necesitan más de siete', async () => {
    const data = sampleReinforcementAnnexes()[0]
    data.snapshot.alertRoster = Array.from({ length: 18 }, (_, i) => ({ student: `Alumno ${i + 1}`, result: '5.50' }))
    const zip = await JSZip.loadAsync(await buildOriginalAnnexDocx(data))
    const text = xmlText(await zip.file('word/document.xml')!.async('string'))
    expect(text).toContain('Alumno 1')
    expect(text).toContain('Alumno 18')
    expect(text.match(/5\.50/g)).toHaveLength(18)
    expect(text).toContain('ENTREGADO POR:')
    expect(text).toContain('RECIBIDO POR:')
  })

  it('respeta las ocho columnas de fechas y diez alumnos por hoja del Anexo 5 sin perder registros', async () => {
    const data = sampleReinforcementAnnexes()[4]
    data.snapshot.sessions = Array.from({ length: 9 }, (_, d) => ({ date: `2026-11-${String(d + 1).padStart(2, '0')}`, attendance: Array.from({ length: 11 }, (_, i) => ({ student: `Alumno ${i + 1}`, status: 'present' })) }))
    const zip = await JSZip.loadAsync(await buildOriginalAnnexDocx(data))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xmlText(xml).match(/REGISTRO DE ASISTENCIA/g)).toHaveLength(4)
    expect(xmlText(xml)).toContain('Alumno 11')
    expect(xmlText(xml)).toContain('09/11')
    expect(xmlText(xml).match(/✓/g)).toHaveLength(99)
    expect(xml.match(/<w:sectPr\b/g)).toHaveLength(1)
  })

  it('escapa XML de los datos sin permitir que modifiquen la estructura o activen otras variables', async () => {
    const data = sampleReinforcementAnnexes()[0]
    data.snapshot.alertRoster = [{ student: '<w:p>Alumno & {{authority}}</w:p>', result: '5.50' }]
    const zip = await JSZip.loadAsync(await buildOriginalAnnexDocx(data))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('&lt;w:p&gt;Alumno &amp; &#123;&#123;authority&#125;&#125;&lt;/w:p&gt;')
    expect(xml).not.toContain('<w:p>Alumno')
  })

  it('mantiene disponible la generación de informes generales anteriores', async () => {
    const data = sampleReinforcementAnnexes()[0]
    delete data.pdfTemplate
    const pdf = await buildFormalReportPdf(data)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })
})
