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

  const { data: allAssignments = [] } = useCourseAssignments(
    activeYear ? { academicYearId: activeYear.id } : undefined,
  )

  // Filter to teacher's own assignments
  const assignments = React.useMemo(() => {
    if (!user) return allAssignments
    if (user.roles.includes('admin') || user.roles.includes('rector') || user.roles.includes('inspector')) return allAssignments
    return allAssignments.filter((a) => a.teacherId === user.id)
  }, [allAssignments, user])

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

  const { data: periods = [] } = usePeriods(activeYear?.id ?? '')

  const defaultPeriodId = React.useMemo(() => {
    if (periods.length === 0) return ''
    const active = periods.find((p) => p.isActive)
    return active?.id ?? periods[0]?.id ?? ''
  }, [periods])

  return {
    activeYear,
    assignments,
    periods,
    defaultAssignmentId,
    defaultPeriodId,
  }
}
