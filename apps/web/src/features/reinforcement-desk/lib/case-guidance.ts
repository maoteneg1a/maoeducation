import type { CaseDetail } from '../api/reinforcement-desk.api'

/** Orientación de navegación; no decide promoción, calificaciones ni cierre de alertas. */
export function caseGuidance(detail: CaseDetail) {
  const k = detail.case
  const planReady = [k.proposalLearningToReinforce || k.learningTargetDescription || k.learningTargetTitle, k.proposalObjective, k.proposalActiveStrategy].every((value) => (value?.trim().length ?? 0) >= 3)
  const attendanceReady = detail.sessions.length > 0 && detail.sessions.every((session) => detail.students.every((student) => session.attendances.some((attendance) => attendance.studentId === student.id)))
  const lastReview = k.reevaluations.map((review) => review.date.slice(0, 10)).sort().slice(-1)[0]
  const lastSession = detail.sessions.map((session) => session.date).sort().slice(-1)[0]
  const learningReviewed = !!lastReview && (!lastSession || lastReview >= lastSession) && k.caseStatus !== 'IN_REINFORCEMENT'
  const next = !detail.canEdit || k.caseStatus === 'CLOSED'
    ? { tab: 'documents', label: 'Ver documentos', description: 'Consulta los informes y respaldos de este seguimiento.' }
    : !planReady
      ? { tab: 'plan', label: 'Completar plan', description: 'Elige el aprendizaje, objetivo y estrategia que faltan.' }
      : !detail.sessions.length
        ? { tab: 'sessions', label: 'Registrar primera actividad', description: 'El plan ya está guardado. Programa la actividad y registra su asistencia.' }
        : !attendanceReady
          ? { tab: 'sessions', label: 'Completar asistencia', description: 'Hay actividades con participantes sin asistencia registrada.' }
          : k.caseStatus === 'CONTINUES_REINFORCEMENT'
            ? { tab: 'sessions', label: 'Registrar siguiente actividad', description: 'La última decisión fue continuar el acompañamiento.' }
            : !learningReviewed
              ? { tab: 'results', label: 'Revisar resultados', description: 'Valora el aprendizaje y revisa el efecto en las notas, si corresponde.' }
              : { tab: 'documents', label: 'Revisar documentos', description: 'Genera o consulta los informes del plan y sus respaldos.' }
  return { planReady, attendanceReady, learningReviewed, next }
}
