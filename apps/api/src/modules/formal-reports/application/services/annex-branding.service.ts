import JSZip from 'jszip'
import sharp from 'sharp'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

export interface AnnexBranding {
  headerParts: string[]
  logoParts: string[]
  headerRelationships: string
  logoRelationshipIds: string[]
}

/** El logo configurado se embebe como PNG para Word y LibreOffice, sin accesos HTTP. */
async function institutionalLogo(logoUrl?: string | null) {
  if (!logoUrl) return null
  try {
    let buffer: Buffer
    const data = /^data:image\/(?:png|jpe?g|webp|svg\+xml);base64,([a-z0-9+/=\s]+)$/i.exec(logoUrl)
    if (data) buffer = Buffer.from(data[1], 'base64')
    else {
      if (!logoUrl.startsWith('/uploads/')) return null
      const directory = path.resolve(process.cwd(), 'uploads')
      const file = path.resolve(directory, decodeURIComponent(logoUrl.slice('/uploads/'.length)))
      if (!file.startsWith(directory + path.sep)) return null
      buffer = await readFile(file)
    }
    if (!buffer.length || buffer.length > 1024 * 1024) return null
    // Los SVG institucionales no necesitan recursos externos ni contenido activo.
    const xml = buffer.toString('utf8').trimStart()
    if (xml.startsWith('<') && /<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|\b(?:href|src)\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i.test(xml)) return null
    return await sharp(buffer, { limitInputPixels: 16_000_000 })
      .rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .png().toBuffer({ resolveWithObject: true })
  } catch {
    // Un logo ausente o inválido nunca reutiliza el escudo de la escuela fuente.
    return null
  }
}

/** Conserva la caja del membrete original y ajusta el logo sin deformarlo. */
export async function applyAnnexLogo(zip: JSZip, branding: AnnexBranding, logoUrl?: string | null) {
  const logo = await institutionalLogo(logoUrl)
  for (const part of branding.headerParts) {
    let xml = await zip.file(part)!.async('string')
    xml = xml.replace(/<w:drawing>\s*<wp:inline\b[\s\S]*?<\/wp:inline>\s*<\/w:drawing>/g, (drawing) => {
      if (!branding.logoRelationshipIds.some((id) => drawing.includes(`r:embed="${id}"`))) return drawing
      if (!logo) return ''
      const extent = /<wp:extent\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/.exec(drawing)
      const boxWidth = extent ? Number(extent[1]) : 450000
      const boxHeight = extent ? Number(extent[2]) : 450000
      const ratio = Math.min(boxWidth / logo.info.width, boxHeight / logo.info.height)
      const width = Math.max(1, Math.round(logo.info.width * ratio))
      const height = Math.max(1, Math.round(logo.info.height * ratio))
      return drawing.replace(/<(?:wp:extent|a:ext)\b[^>]*\/>/g, (tag) => {
        if (!/\bcx="\d+"/.test(tag) || !/\bcy="\d+"/.test(tag)) return tag
        return tag.replace(/\bcx="\d+"/, `cx="${width}"`).replace(/\bcy="\d+"/, `cy="${height}"`)
      })
    })
    zip.file(part, xml)
  }
  if (logo) {
    for (const part of branding.logoParts) zip.file(part, logo.data)
  } else {
    for (const part of branding.logoParts) zip.remove(part)
    const relationships = await zip.file(branding.headerRelationships)!.async('string')
    zip.file(branding.headerRelationships, relationships.replace(/<Relationship\b[^>]*\/>/g, (relationship) =>
      branding.logoRelationshipIds.some((id) => relationship.includes(`Id="${id}"`)) ? '' : relationship))
  }
}
