import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { applyAnnexSignatures } from './annex-signatures.service'

describe('firmas en los anexos originales', () => {
  it.each([1, 2, 3, 4, 5])('conserva los textos y párrafos del Anexo %s al insertar las firmas', async (number) => {
    const zip = await JSZip.loadAsync(await readFile(path.resolve('assets/reinforcement-annexes', `annex-${number}.docx`)))
    const original = await zip.file('word/document.xml')!.async('string')
    const imageData = 'data:image/png;base64,' + (await sharp({ create: { width: 150, height: 40, channels: 4, background: '#123456' } }).png().toBuffer()).toString('base64')
    const signature = { userId: 'signer', name: 'Firmante', imageData, sha256: 'hash', documentHash: 'document', signedAt: '2026-10-26T17:00:00Z' }
    await applyAnnexSignatures(zip, number, signature, signature)
    const xml = await zip.file('word/document.xml')!.async('string')
    const texts = (input: string) => [...input.matchAll(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g)].map((m) => m[0])
    expect(texts(xml)).toEqual(texts(original))
    expect(xml.match(/<w:p\b/g)?.length).toBe(original.match(/<w:p\b/g)?.length)
    expect(xml).toContain('rIdAulekaSignatureauthor')
    if (number !== 5) expect(xml).toContain('rIdAulekaSignaturerecipient')
    expect(await zip.file('word/_rels/document.xml.rels')!.async('string')).toContain('auleka-signature-author.png')
  })
})
