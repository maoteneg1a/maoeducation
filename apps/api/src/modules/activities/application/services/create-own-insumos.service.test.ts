import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  academicPeriod: { findFirst: vi.fn() },
  courseAssignment: { findMany: vi.fn() },
  insumo: { findMany: vi.fn(), createMany: vi.fn() },
  $executeRaw: vi.fn(),
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: { $transaction: (run: (tx: typeof db) => unknown) => run(db) } }))
import { createOwnInsumos } from './create-own-insumos.service'

const actor = { userId: 'teacher', roles: ['teacher'], permissions: ['insumos:write:own'] }
const dto = { periodId: 'period', courseAssignmentIds: ['math', 'science'], names: ['Deberes', 'Lecciones'] }
beforeEach(() => {
  vi.clearAllMocks()
  db.academicPeriod.findFirst.mockResolvedValue({ academicYearId: 'year', isClosed: false })
  db.courseAssignment.findMany.mockResolvedValue([{ id: 'math' }, { id: 'science' }])
  db.insumo.findMany.mockResolvedValue([])
  db.insumo.createMany.mockResolvedValue({ count: 4 })
})
describe('insumos para materias propias', () => {
  it('crea en las materias propias, activas, de la institución y año del período', async () => {
    expect(await createOwnInsumos('school', actor, dto)).toEqual({ assignments: 2, created: 4, skipped: 0 })
    expect(db.academicPeriod.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'period', academicYear: { institutionId: 'school' } } }))
    expect(db.courseAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { institutionId: 'school', id: { in: ['math', 'science'] }, teacherId: 'teacher', academicYearId: 'year', isActive: true } }))
    expect(db.insumo.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ institutionId: 'school', courseAssignmentId: 'math', academicPeriodId: 'period', createdBy: 'teacher', name: 'Deberes' })]) })
  })
  it('rechaza todo el lote si incluye una materia ajena, incluso para una autoridad', async () => {
    db.courseAssignment.findMany.mockResolvedValue([{ id: 'math' }])
    await expect(createOwnInsumos('school', { ...actor, roles: ['rector'] }, dto)).rejects.toThrow('propias materias')
    expect(db.insumo.createMany).not.toHaveBeenCalled()
  })
  it('no sobrescribe existentes y omite duplicados con espacios o mayúsculas', async () => {
    db.insumo.findMany.mockResolvedValue([{ courseAssignmentId: 'math', name: ' DEBERES ', sortOrder: 4 }])
    expect(await createOwnInsumos('school', actor, { ...dto, names: ['Deberes', ' deberes ', 'Lecciones'] })).toEqual({ assignments: 2, created: 3, skipped: 1 })
    const additions = db.insumo.createMany.mock.calls[0][0].data
    expect(additions.filter((item: { courseAssignmentId: string }) => item.courseAssignmentId === 'math')).toEqual([expect.objectContaining({ name: 'Lecciones', sortOrder: 5 })])
  })
  it('repetir una solicitud no vuelve a crear los mismos insumos', async () => {
    db.insumo.findMany.mockResolvedValue(dto.courseAssignmentIds.flatMap((courseAssignmentId) => dto.names.map((name, sortOrder) => ({ courseAssignmentId, name, sortOrder }))))
    expect(await createOwnInsumos('school', actor, dto)).toEqual({ assignments: 2, created: 0, skipped: 4 })
    expect(db.insumo.createMany).not.toHaveBeenCalled()
    expect(db.$executeRaw).toHaveBeenCalledTimes(2)
  })
  it.each([null, { academicYearId: 'year', isClosed: true }])('rechaza períodos ajenos, inexistentes o cerrados', async (period) => {
    db.academicPeriod.findFirst.mockResolvedValue(period)
    await expect(createOwnInsumos('school', actor, dto)).rejects.toThrow('período abierto')
    expect(db.insumo.createMany).not.toHaveBeenCalled()
  })
  it('requiere permiso propio y nombres válidos antes de escribir', async () => {
    await expect(createOwnInsumos('school', { ...actor, permissions: [] }, dto)).rejects.toThrow()
    await expect(createOwnInsumos('school', actor, { ...dto, names: ['   '] })).rejects.toThrow('Selecciona')
    expect(db.insumo.createMany).not.toHaveBeenCalled()
  })
})
