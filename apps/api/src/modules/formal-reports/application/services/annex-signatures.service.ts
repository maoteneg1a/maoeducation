import type JSZip from 'jszip'
import sharp from 'sharp'
import type { DocumentSignature } from '../../../users/application/services/user-signature.service'

/** Dibujos flotantes en los espacios de firma existentes: no agrega filas, párrafos ni cambia textos. */
export async function applyAnnexSignatures(zip: JSZip, number: number, author?: DocumentSignature | null, recipient?: DocumentSignature | null) {
  if (!author && !recipient) return
  let xml = await zip.file('word/document.xml')!.async('string')
  let relationships = await zip.file('word/_rels/document.xml.rels')!.async('string')
  const drawings = new Map<string, { relationship: string; width: number; height: number }>()
  for (const [role, signature] of [['author', author], ['recipient', recipient]] as const) {
    if (!signature?.imageData) continue
    const buffer = Buffer.from(signature.imageData.split(',')[1], 'base64')
    const metadata = await sharp(buffer).metadata()
    const scale = Math.min(118 / (metadata.width || 1), 32 / (metadata.height || 1))
    const relationship = `rIdAulekaSignature${role}`
    zip.file(`word/media/auleka-signature-${role}.png`, buffer)
    relationships = relationships.replace('</Relationships>', `<Relationship Id="${relationship}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/auleka-signature-${role}.png"/></Relationships>`)
    drawings.set(role, { relationship, width: (metadata.width || 1) * scale, height: (metadata.height || 1) * scale })
  }
  let counter = 9000
  function drawing(role: string, x: number, y: number, relative = 'column') {
    const image = drawings.get(role)
    if (!image) return ''
    const id = ++counter
    const scale = number === 1 ? Math.min(1, 22 / image.height) : 1
    const cx = Math.round(image.width * scale * 12700), cy = Math.round(image.height * scale * 12700)
    return `<w:r><w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${id}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="${relative}"><wp:posOffset>${Math.round(x * 12700)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>${Math.round(y * 12700)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:wrapNone/><wp:docPr id="${id}" name="Firma ${role} ${id}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="Firma ${role}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${image.relationship}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`
  }
  let firmaIndex = 0
  xml = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const text = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join('')
    let insert = ''
    if (number === 1 && /^Firma:/.test(text.trim())) insert = drawing(firmaIndex++ === 0 ? 'author' : 'recipient', 10, 0, 'character')
    if (number === 2 && text.includes('PADRE DE FAMILIA') && text.includes('DOCENTE') && text.includes('SUBDIRECTORA')) insert = drawing('author', 185, 14) + drawing('recipient', 20, 14)
    if (number === 3 && text.includes('SUBDIRECTORA') && text.includes('DOCENTE')) insert = drawing('author', 310, -30) + drawing('recipient', 30, -30)
    if (number === 4 && text.includes('f) Docente/ Tutor')) insert = drawing('author', 15, 14) + drawing('recipient', 260, 14)
    if (number === 5 && text.trim().startsWith('f)') && text.includes('…')) insert = drawing('author', 185, -30)
    return insert ? paragraph.replace('</w:p>', insert + '</w:p>') : paragraph
  })
  zip.file('word/document.xml', xml)
  zip.file('word/_rels/document.xml.rels', relationships)
  const types = await zip.file('[Content_Types].xml')!.async('string')
  if (!types.includes('Extension="png"')) zip.file('[Content_Types].xml', types.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'))
}
