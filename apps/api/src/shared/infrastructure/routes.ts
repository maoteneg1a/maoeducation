import { FastifyInstance } from 'fastify'

export async function registerRoutes(app: FastifyInstance) {
  app.register(import('../../modules/auth/presentation/auth.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/users/presentation/user.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/academic/presentation/academic.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/enrollment/presentation/enrollment.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/activities/presentation/activity.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/attendance/presentation/attendance.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/incidents/presentation/incident.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/parent-meetings/presentation/parent-meeting.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/student-folder/presentation/student-folder.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/schedules/presentation/schedule.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/messaging/presentation/message.routes'), { prefix: '/api/v1' })

  app.register(import('../../modules/tasks/presentation/task.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/reports/presentation/report.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/dashboard/dashboard.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/platform/presentation/platform.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/subscription/presentation/subscription.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/subscription/presentation/platform-subscription.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/platform/presentation/platform-stats.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/institution/presentation/institution.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/guardians/presentation/guardian.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/anamnesis/presentation/anamnesis.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/behavior/presentation/behavior.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/promotion/presentation/promotion.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/pedagogic-recovery/presentation/pedagogic-recovery.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/curriculum/presentation/curriculum.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/competency-curriculum/presentation/competency-curriculum.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/curricular-insertions/presentation/curricular-insertion.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/planning/presentation/planning.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/ai-assistant/presentation/ai-assistant.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/interdisciplinary-projects/presentation/interdisciplinary-project.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/leads/presentation/lead.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/analytics/presentation/analytics.routes'), { prefix: '/api/v1' })

  app.register(import('../../modules/push/presentation/push.routes'), { prefix: '/api/v1' })
  app.register(import('../../modules/personal/presentation/personal.routes'), { prefix: '/api/v1' })

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))
}
