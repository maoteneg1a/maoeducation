import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ institution: { findUnique: vi.fn(), update: vi.fn() }, $transaction: vi.fn() }))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
import { saveActaTemplate, getActaTemplate } from './acta-template.service'
import { DEFAULT_ACTA_TEMPLATE } from './commitment-document'
beforeEach(() => {
  vi.resetAllMocks()
  db.$transaction.mockImplementation(async (callback) => callback(db))
  db.institution.findUnique.mockResolvedValue({ settings: { branding: { logoUrl: '/logo.png' }, documentTemplates: { microcurricular: { title: 'Plan' } } } })
})
describe('plantilla institucional de actas', () => {
  it('guarda en la institución solicitada y conserva otras configuraciones y plantillas', async () => {
    await saveActaTemplate('school', { ...DEFAULT_ACTA_TEMPLATE, title: 'Acta institucional' })
    expect(db.institution.findUnique).toHaveBeenCalledWith({ where: { id: 'school' }, select: { settings: true } })
    expect(db.institution.update).toHaveBeenCalledWith({ where: { id: 'school' }, data: { settings: {
      branding: { logoUrl: '/logo.png' }, documentTemplates: { microcurricular: { title: 'Plan' }, incidentCommitment: { ...DEFAULT_ACTA_TEMPLATE, title: 'Acta institucional' } },
    } } })
  })
  it('rechaza configuraciones inválidas sin escribir', async () => {
    await expect(saveActaTemplate('school', { ...DEFAULT_ACTA_TEMPLATE, accentColor: 'red' })).rejects.toMatchObject({ statusCode: 400 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('no inventa una institución cuando no existe', async () => {
    db.institution.findUnique.mockResolvedValue(null)
    await expect(getActaTemplate('absent')).rejects.toMatchObject({ statusCode: 404 })
  })
})
