import * as React from 'react'
import { useAcademicYears, useCourseAssignments, usePeriods } from './useAcademic'
import { useAuthStore } from '@/store/auth.store'

/**
 * Returns pre-selected defaults for teacher context:
 * - defaultAssignmentId: tutored parallel's assignment → or single assignment
 * - defaultPeriodId: active period for the active year
 * - activeYear, assignments, periods (for rendering selectors)
 */
export function useTeacherDefaults(excludedParallels?: ReadonlySet<string>) {
  const user = useAuthStore((s) => s.user)

  const years = useAcademicYears()
  const activeYear = years.data?.find((y) => y.isActive)

  const ownAssignmentQuery = useCourseAssignments(
    activeYear ? { academicYearId: activeYear.id } : undefined,
  )
  const consultableAssignmentQuery = useCourseAssignments(
    activeYear ? { academicYearId: activeYear.id, scope: 'consultable' } : { scope: 'consultable' },
  )

  // Filter to teacher's own assignments
  const assignments = React.useMemo(() => {
    const available = (ownAssignmentQuery.data ?? []).filter(assignment => !excludedParallels?.has(assignment.parallelId))
    if (!user || user.roles.some(role => ['admin', 'rector', 'inspector'].includes(role))) return available
    return available.filter(assignment => assignment.teacherId === user.id)
  }, [ownAssignmentQuery.data, excludedParallels, user])

  // Lectura: además de sus materias, el tutor consulta todas las asignaturas
  // de los paralelos que tiene a cargo. La escritura sigue limitada en backend.
  const consultableAssignments = React.useMemo(() => {
    const available = (consultableAssignmentQuery.data ?? []).filter(assignment => !excludedParallels?.has(assignment.parallelId))
    if (!user || user.roles.some(role => ['admin', 'rector', 'inspector'].includes(role))) return available
    const tutored = new Set(user.tutorParallelIds ?? [])
    return available.filter(assignment => assignment.teacherId === user.id || tutored.has(assignment.parallelId))
  }, [consultableAssignmentQuery.data, excludedParallels, user])

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
    assignmentsPending: years.isPending || ownAssignmentQuery.isPending,
    consultableAssignmentsPending: years.isPending || ownAssignmentQuery.isPending || consultableAssignmentQuery.isPending,
    assignmentsError: years.isError || ownAssignmentQuery.isError,
    consultableAssignmentsError: years.isError || ownAssignmentQuery.isError || consultableAssignmentQuery.isError,
  }
}
