import { prisma } from '../database/prisma'
import type { Prisma } from '@prisma/client'
import type { FormativeApplication } from '../../domain/formative-reinforcement'

export const formativeKey = (studentId: string, assignmentId: string, periodId: string) => `${studentId}:${assignmentId}:${periodId}`

/** Última versión, incluso cuando revoca una aplicación anterior (score=null). */
export async function loadFormativeApplications(institutionId: string, assignmentIds: string[], periodIds: string[], studentIds: string[], db: Prisma.TransactionClient = prisma) {
  const result = new Map<string, FormativeApplication>()
  if (!assignmentIds.length || !periodIds.length || !studentIds.length) return result
  const rows = await db.formativeReinforcementResult.findMany({
    where: { institutionId, courseAssignmentId: { in: assignmentIds }, academicPeriodId: { in: periodIds }, studentId: { in: studentIds } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  })
  for (const row of rows) {
    const key = formativeKey(row.studentId, row.courseAssignmentId, row.academicPeriodId)
    if (!result.has(key)) result.set(key, row.payload as unknown as FormativeApplication)
  }
  return result
}
