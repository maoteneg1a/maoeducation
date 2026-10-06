export interface CreateScheduleEntryDto {
  courseAssignmentId: string
  weekday: number // 1-5
  startTime: string // "HH:MM"
  endTime: string   // "HH:MM"
  room?: string
}

export interface UpdateScheduleEntryDto {
  weekday?: number
  startTime?: string
  endTime?: string
  room?: string
}

export interface GetScheduleQuery {
  parallelId?: string
  teacherId?: string
  yearId?: string
  studentId?: string
}
