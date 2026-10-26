import assert from 'node:assert/strict'
import { caseGuidance } from '../apps/web/src/features/reinforcement-desk/lib/case-guidance'
import { todayInEcuador } from '../apps/web/src/shared/lib/today-in-ecuador'
import type { CaseDetail } from '../apps/web/src/features/reinforcement-desk/api/reinforcement-desk.api'

const detail = {
  canEdit: true,
  case: { caseStatus: 'PLANNED', proposalLearningToReinforce: 'Fracciones', proposalObjective: 'Resolver problemas', proposalActiveStrategy: 'Práctica guiada', reevaluations: [] },
  students: [{ id: 'one' }, { id: 'two' }], sessions: [], reports: [], scores: [{ alertStatus: 'OPEN', formative: 6 }],
} as unknown as CaseDetail

assert.equal(caseGuidance(detail).next.tab, 'sessions')
detail.case.proposalObjective = ''
assert.equal(caseGuidance(detail).next.tab, 'plan')
detail.case.proposalObjective = 'Resolver problemas'
detail.sessions = [{ id: 'session', date: '2026-10-26', attendances: [{ studentId: 'one', status: 'present', score: 9 }] }] as CaseDetail['sessions']
assert.equal(caseGuidance(detail).next.label, 'Completar asistencia')
detail.sessions[0].attendances.push({ studentId: 'two', status: 'absent', score: null, observation: null, appliedScore: null, appliedMode: null })
assert.equal(caseGuidance(detail).next.tab, 'results')
assert.equal(caseGuidance(detail).attendanceReady, true)
detail.case.caseStatus = 'CONTINUES_REINFORCEMENT'
assert.equal(caseGuidance(detail).next.label, 'Registrar siguiente actividad')
detail.case.reevaluations = [{ date: '2026-10-26T17:00:00Z' }] as CaseDetail['case']['reevaluations']
detail.case.caseStatus = 'IN_REINFORCEMENT'
assert.equal(caseGuidance(detail).learningReviewed, false)
assert.equal(caseGuidance(detail).next.tab, 'results')
detail.case.caseStatus = 'CLOSED'
assert.equal(caseGuidance(detail).next.tab, 'documents')
assert.equal(detail.scores[0].alertStatus, 'OPEN')
assert.equal(detail.scores[0].formative, 6)
detail.canEdit = false
detail.case.caseStatus = 'PLANNED'
assert.equal(caseGuidance(detail).next.tab, 'documents')
assert.equal(todayInEcuador(new Date('2026-10-27T02:00:00Z')), '2026-10-26')
assert.equal(todayInEcuador(new Date('2026-10-27T05:00:00Z')), '2026-10-27')
console.info('Recorridos de refuerzo, estados independientes y fecha local: correctos.')
