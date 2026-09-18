import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/shared/components/layout/AppLayout'
import { PrivateRoute } from './PrivateRoute'
import { PermissionGuard } from './PermissionGuard'
import { PersonalStructureGuard } from './PersonalStructureGuard'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { PersonalRegisterPage } from '@/features/personal/pages/PersonalRegisterPage'
import { PersonalLoginPage } from '@/features/personal/pages/PersonalLoginPage'
import { PersonalSetupPage } from '@/features/personal/pages/PersonalSetupPage'
import PersonalCheckEmailPage from '@/features/personal/pages/PersonalCheckEmailPage'
import PersonalVerifyEmailPage from '@/features/personal/pages/PersonalVerifyEmailPage'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { PlatformPrivateRoute } from './PlatformPrivateRoute'
import { PlatformLayout } from '@/shared/components/layout/PlatformLayout'
import { PlatformLoginPage } from '@/features/platform/pages/PlatformLoginPage'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/personal/register',
    element: <PersonalRegisterPage />,
  },
  {
    path: '/personal/login',
    element: <PersonalLoginPage />,
  },
  {
    path: '/personal/check-email',
    element: <PersonalCheckEmailPage />,
  },
  {
    path: '/personal/verify-email',
    element: <PersonalVerifyEmailPage />,
  },
  {
    path: '/personal/setup',
    element: (
      <PrivateRoute>
        <PersonalSetupPage />
      </PrivateRoute>
    ),
  },
  {
    path: '/',
    element: (
      <PrivateRoute>
        <AppLayout />
      </PrivateRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      // ---- Users ----
      {
        path: 'users',
        element: <PermissionGuard permission="users:read" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/users/pages/UsersPage').then((m) => ({
                Component: m.UsersPage,
              })),
          },
        ],
      },
      // ---- Roles ----
      {
        path: 'roles',
        element: <PermissionGuard permission="users:manage" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/users/pages/RolesPage').then((m) => ({
                Component: m.RolesPage,
              })),
          },
        ],
      },
      // ---- Academic Config ----
      // Estructura académica (niveles, materias, años, paralelos, asignaciones,
      // insumos): se crea una sola vez desde el wizard /personal/setup para
      // cuentas personales de profesor, así que PersonalStructureGuard bloquea
      // el acceso a esa cuenta aunque entre por URL directa. No afecta a
      // instituciones normales (accountType !== 'personal').
      {
        path: 'academic',
        element: <PermissionGuard permission="academic_config:manage" />,
        children: [
          {
            element: <PersonalStructureGuard />,
            children: [
              {
                index: true,
                lazy: () =>
                  import('@/features/academic/pages/AcademicPage').then((m) => ({
                    Component: m.AcademicPage,
                  })),
              },
              {
                path: 'levels',
                lazy: () =>
                  import('@/features/academic/pages/LevelsPage').then((m) => ({
                    Component: m.LevelsPage,
                  })),
              },
              {
                path: 'subjects',
                lazy: () =>
                  import('@/features/academic/pages/SubjectsPage').then((m) => ({
                    Component: m.SubjectsPage,
                  })),
              },
              {
                path: 'years',
                lazy: () =>
                  import('@/features/academic/pages/AcademicYearsPage').then((m) => ({
                    Component: m.AcademicYearsPage,
                  })),
              },
              {
                path: 'parallels',
                lazy: () =>
                  import('@/features/academic/pages/ParallelsPage').then((m) => ({
                    Component: m.ParallelsPage,
                  })),
              },
              {
                path: 'assignments',
                lazy: () =>
                  import('@/features/academic/pages/CourseAssignmentsPage').then((m) => ({
                    Component: m.CourseAssignmentsPage,
                  })),
              },
              {
                path: 'insumo-setup',
                lazy: () =>
                  import('@/features/academic/pages/ParallelInsumoSetupPage').then((m) => ({
                    Component: m.ParallelInsumoSetupPage,
                  })),
              },
            ],
          },
        ],
      },
      // ---- Activities ----
      {
        path: 'activities',
        element: <PermissionGuard permission="activities:write" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/activities/pages/ActivitiesPage').then((m) => ({
                Component: m.ActivitiesPage,
              })),
          },
        ],
      },
      // ---- Grades ----
      {
        path: 'grades',
        element: <PermissionGuard permission="grades:read" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/grades/pages/GradeEntryPage').then((m) => ({
                Component: m.GradeEntryPage,
              })),
          },
        ],
      },
      // ---- Behavior (comportamiento) ----
      {
        path: 'behavior',
        element: <PermissionGuard permission="grades:write" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/behavior/pages/BehaviorEntryPage').then((m) => ({
                Component: m.BehaviorEntryPage,
              })),
          },
        ],
      },
      // ---- Pedagogic Recovery (recuperación pedagógica) ----
      {
        path: 'pedagogic-recovery',
        element: <PermissionGuard permission="grades:write" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/pedagogic-recovery/pages/PedagogicRecoveryPage').then((m) => ({
                Component: m.PedagogicRecoveryPage,
              })),
          },
        ],
      },
      // ---- Reinforcement Plans (refuerzo y adaptaciones NEE) ----
      {
        path: 'reinforcement-plans',
        element: <PermissionGuard permission="grades:write" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/pedagogic-recovery/pages/ReinforcementPlansPage').then((m) => ({
                Component: m.ReinforcementPlansPage,
              })),
          },
        ],
      },
      // ---- Interdisciplinary Projects ----
      {
        path: 'interdisciplinary-projects',
        element: <PermissionGuard permission="planning:read" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/interdisciplinary-projects/pages/InterdisciplinaryProjectsPage').then((m) => ({
                Component: m.InterdisciplinaryProjectsPage,
              })),
          },
          {
            path: ':id',
            lazy: () =>
              import('@/features/interdisciplinary-projects/pages/InterdisciplinaryProjectDetailPage').then((m) => ({
                Component: m.InterdisciplinaryProjectDetailPage,
              })),
          },
        ],
      },
      // ---- Promotion (promoción y recuperaciones) ----
      {
        path: 'promotion',
        element: <PermissionGuard permission="grades:read" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/promotion/pages/PromotionPage').then((m) => ({
                Component: m.PromotionPage,
              })),
          },
        ],
      },
      // ---- Planning (PCA / Planificación Microcurricular) ----
      {
        path: 'planning',
        element: <PermissionGuard permission="planning:read" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/planning/pages/PlanningListPage').then((m) => ({
                Component: m.PlanningListPage,
              })),
          },
          {
            path: 'situations/:id',
            lazy: () =>
              import('@/features/planning/pages/PlanningSituationPage').then((m) => ({
                Component: m.PlanningSituationPage,
              })),
          },
          {
            path: ':id',
            lazy: () =>
              import('@/features/planning/pages/PlanningDetailPage').then((m) => ({
                Component: m.PlanningDetailPage,
              })),
          },
        ],
      },
      // ---- Enrollment ----
      {
        path: 'enrollment',
        element: <PermissionGuard permission="enrollment:read" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/enrollment/pages/EnrollmentPage').then((m) => ({
                Component: m.EnrollmentPage,
              })),
          },
        ],
      },
      // ---- Attendance ----
      {
        path: 'attendance',
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/attendance/pages/AttendancePage').then((m) => ({
                Component: m.AttendancePage,
              })),
          },
        ],
      },
      {
        path: 'attendance/justifications',
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/attendance/pages/JustificationsPage').then((m) => ({
                Component: m.JustificationsPage,
              })),
          },
        ],
      },
      // ---- Reports ----
      {
        path: 'reports',
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/reports/pages/ReportsPage').then((m) => ({
                Component: m.ReportsPage,
              })),
          },
        ],
      },
      // ---- Incidents ----
      {
        path: 'incidents',
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/incidents/pages/IncidentsPage').then((m) => ({
                Component: m.IncidentsPage,
              })),
          },
          {
            path: 'types',
            element: <PermissionGuard permission="incident_types:manage" />,
            children: [
              {
                index: true,
                lazy: () =>
                  import('@/features/incidents/pages/IncidentTypesPage').then((m) => ({
                    Component: m.IncidentTypesPage,
                  })),
              },
            ],
          },
          {
            path: ':id',
            lazy: () =>
              import('@/features/incidents/pages/IncidentDetailPage').then((m) => ({
                Component: m.IncidentDetailPage,
              })),
          },
        ],
      },
      // ---- Parent meetings (atención a padres) ----
      {
        path: 'parent-meetings',
        element: <PermissionGuard permission="parent_meetings:read" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/parent-meetings/pages/ParentMeetingsPage').then((m) => ({
                Component: m.ParentMeetingsPage,
              })),
          },
          {
            path: ':id',
            lazy: () =>
              import('@/features/parent-meetings/pages/ParentMeetingDetailPage').then((m) => ({
                Component: m.ParentMeetingDetailPage,
              })),
          },
        ],
      },
      // ---- Carpeta del estudiante ----
      {
        path: 'student-folder',
        element: <PermissionGuard permission="student_folder:read" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/student-folder/pages/StudentFolderListPage').then((m) => ({
                Component: m.StudentFolderListPage,
              })),
          },
          {
            path: ':id',
            lazy: () =>
              import('@/features/student-folder/pages/StudentFolderPage').then((m) => ({
                Component: m.StudentFolderPage,
              })),
          },
        ],
      },
      // ---- Schedules ----
      {
        path: 'schedules',
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/schedules/pages/SchedulePage').then((m) => ({
                Component: m.SchedulePage,
              })),
          },
        ],
      },
      // ---- Messaging ----
      {
        path: 'messages',
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/messaging/pages/MessagingPage').then((m) => ({
                Component: m.MessagingPage,
              })),
          },
        ],
      },
      // ---- Tasks ----
      {
        path: 'tasks',
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/tasks/pages/TasksPage').then((m) => ({
                Component: m.TasksPage,
              })),
          },
        ],
      },
      // ---- Calendar ----
      {
        path: 'calendar',
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/calendar/pages/CalendarPage').then((m) => ({
                Component: m.CalendarPage,
              })),
          },
        ],
      },
      // ---- Settings / Branding ----
      {
        path: 'settings/branding',
        element: <PermissionGuard permission="institution_config:manage" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/settings/pages/BrandingPage').then((m) => ({
                Component: m.BrandingPage,
              })),
          },
        ],
      },
      // ---- Suscripción ----
      // Va por permiso, NO por módulo: un módulo desactivable dejaría a una
      // institución bloqueada por falta de pago sin forma de pagar.
      {
        path: 'subscription',
        element: <PermissionGuard permission="institution_config:manage" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/subscription/pages/SubscriptionPage').then((m) => ({
                Component: m.SubscriptionPage,
              })),
          },
        ],
      },
      // ---- Settings / Grading config ----
      {
        path: 'settings/calificacion',
        element: <PermissionGuard permission="academic_config:manage" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/settings/pages/GradingConfigPage').then((m) => ({
                Component: m.GradingConfigPage,
              })),
          },
        ],
      },
      // ---- Settings / Microcurricular document template ----
      {
        path: 'settings/formato-planificacion',
        element: <PermissionGuard permission="academic_config:manage" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/settings/pages/MicrocurricularTemplatePage').then((m) => ({
                Component: m.MicrocurricularTemplatePage,
              })),
          },
        ],
      },
      // ---- Settings / Mis grados y materias (solo cuentas personales) ----
      // Reemplaza al wizard de /personal/setup como único punto de edición
      // post-onboarding — PersonalStructureGuard sigue bloqueando las
      // pantallas normales de estructura académica (niveles/materias/
      // paralelos/asignaciones), esta es la vía dedicada para cuentas
      // personales en su lugar.
      {
        path: 'settings/mis-grados',
        element: <PermissionGuard permission="academic_config:manage" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/settings/pages/PersonalClassesPage').then((m) => ({
                Component: m.PersonalClassesPage,
              })),
          },
        ],
      },
      // ---- Settings / Anamnesis template ----
      {
        path: 'settings/anamnesis',
        element: <PermissionGuard permission="anamnesis:manage" />,
        children: [
          {
            index: true,
            lazy: () =>
              import('@/features/students/pages/AnamnesisTemplatePage').then((m) => ({
                Component: m.AnamnesisTemplatePage,
              })),
          },
        ],
      },
      // ---- Student detail (ficha) ----
      {
        path: 'students/:id',
        lazy: () =>
          import('@/features/students/pages/StudentDetailPage').then((m) => ({
            Component: m.StudentDetailPage,
          })),
      },
    ],
  },
  // ---- Plataforma (superadmin global, fuera del tenant) ----
  {
    path: '/platform/login',
    element: <PlatformLoginPage />,
  },
  {
    path: '/platform',
    element: (
      <PlatformPrivateRoute>
        <PlatformLayout />
      </PlatformPrivateRoute>
    ),
    children: [
      {
        index: true,
        lazy: () =>
          import('@/features/platform/pages/InstitutionsPage').then((m) => ({
            Component: m.InstitutionsPage,
          })),
      },
      {
        path: 'institutions/:id/admins',
        lazy: () =>
          import('@/features/platform/pages/InstitutionAdminsPage').then((m) => ({
            Component: m.InstitutionAdminsPage,
          })),
      },
      {
        path: 'subscriptions',
        lazy: () =>
          import('@/features/platform/pages/SubscriptionsPage').then((m) => ({
            Component: m.SubscriptionsPage,
          })),
      },
      {
        path: 'leads',
        lazy: () =>
          import('@/features/platform/pages/LeadsPage').then((m) => ({
            Component: m.LeadsPage,
          })),
      },
      {
        path: 'stats',
        lazy: () =>
          import('@/features/platform/pages/StatsPage').then((m) => ({
            Component: m.StatsPage,
          })),
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
