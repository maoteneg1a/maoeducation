import type { BoardConfig } from './course-board-config'

export interface BoardSnapshot {
  institutionName: string
  parallelName: string
  periodName: string
  yearName: string
  chairName?: string
  tutorName: string
  generatedAt: string
  config: BoardConfig
  subjects: Array<{ id: string; name: string; teacherId: string; teacherName: string; isQualitative: boolean }>
  rows: Array<{
    id: string; name: string; dni: string | null
    grades: Array<{ assignmentId: string; value: number | null; display: string; partial: boolean }>
    absences: number; late: number; incidents: number; reinforcement: number; behavior: string | null; observation: string | null
  }>
}
export interface BoardReportDocument {
  typeKey: string; title: string; authorId: string; authorName: string
  courseAssignmentId: string | null; subjectName: string | null
  situation: string; actions: string; recommendations: string
  labels: { situation: string; actions: string; recommendations: string }
  institutionName: string; parallelName: string; yearName: string; periodName: string; generatedAt: string
}
