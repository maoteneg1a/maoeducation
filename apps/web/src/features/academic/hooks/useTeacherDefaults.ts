import * as React from 'react'
import { useAcademicYears, useCourseAssignments, usePeriods } from './useAcademic'
import { useAuthStore } from '@/store/auth.store'

/**
 * Returns pre-selected defaults for teacher context:
 * - defaultAssignmentId: tutored parallel's assignment → or single assignment
 * - defaultPeriodId: active period for the active year
 * - activeYear, assignments, periods (for rendering selectors)
 */
export function useTeacherDefaults() {
  const user = useAuthStore((s) => s.user)

  const { data: years = [] } = useAcademicYears()
  const activeYear = years.find((y) => y.isActive)

  const { data: ownAssignments = [] } = useCourseAssignments(
    activeYear ? { academicYearId: activeYear.id } : undefined,
  )
  const { data: allConsultableAssignments = [] } = useCourseAssignments(
    activeYear ? { academicYearId: activeYear.id, scope: 'consultable' } : { scope: 'consultable' },
  )

  // Filter to teacher's own assignments
  const assignments = React.useMemo(() => {
    if (!user) return ownAssignments
    if (user.roles.includes('admin') || user.roles.includes('rector') || user.roles.includes('inspector')) return ownAssignments
    return ownAssignments.filter((a) => a.teacherId === user.id)
  }, [ownAssignments, user])

  // Lectura: además de sus materias, el tutor consulta todas las asignaturas
  // de los paralelos que tiene a cargo. La escritura sigue limitada en backend.
  const consultableAssignments = React.useMemo(() => {
    if (!user) return allConsultableAssignments
    if (user.roles.includes('admin') || user.roles.includes('rector') || user.roles.includes('inspector')) return allConsultableAssignments
    const tutored = new Set(user.tutorParallelIds ?? [])
    return allConsultableAssignments.filter((a) => a.teacherId === user.id || tutored.has(a.parallelId))
  }, [allConsultableAssignments, user])

  // Pick default assignment:
  // 1. If teacher tutors a parallel → use that parallel's assignment
  // 2. If teacher has only one assignment → use it
  const defaultAssignmentId = React.useMemo(() => {
    if (assignments.length === 0) return ''
    if (assignments.length === 1) return assignments[0].id

    const tutorIds = user?.tutorParallelIds ?? []
    if (tutorIds.length > 0) {
      const tutorAssignment = assignments.find((a) => tutorIds.includes(a.parallelId))
      if (tutorAssignment) return tutorAssignment.id
    }

    return ''
  }, [assignments, user])

  const defaultConsultationAssignmentId = React.useMemo(() => {
    const tutorIds = user?.tutorParallelIds ?? []
    return consultableAssignments.find((a) => tutorIds.includes(a.parallelId))?.id
      ?? defaultAssignmentId
  }, [consultableAssignments, defaultAssignmentId, user])

  const { data: periods = [] } = usePeriods(activeYear?.id ?? '')

  const defaultPeriodId = React.useMemo(() => {
    if (periods.length === 0) return ''
    const active = periods.find((p) => p.isActive)
    return active?.id ?? periods[0]?.id ?? ''
  }, [periods])

  return {
    activeYear,
    assignments,
    consultableAssignments,
    periods,
    defaultAssignmentId,
    defaultConsultationAssignmentId,
    defaultPeriodId,
  }
}
