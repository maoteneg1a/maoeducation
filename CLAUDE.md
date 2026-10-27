# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Node.js is managed via nvm. Always prefix commands with:
```bash
export PATH="$HOME/.nvm/versions/node/v20.19.5/bin:$PATH"
```

### Development
```bash
# Start everything (API + Web + DB)
bash scripts/dev.sh

# Or individually:
cd apps/api  && pnpm dev   # API on :3000
cd apps/web  && pnpm dev   # Frontend on :5173
docker compose up -d        # PostgreSQL on :5433
```

### Database
```bash
cd apps/api
pnpm db:migrate      # Run pending migrations (dev)
pnpm db:seed         # Seed initial data
pnpm db:studio       # Open Prisma Studio
pnpm db:generate     # Regenerate Prisma Client after schema changes
```

### Type checking & build
```bash
pnpm lint            # tsc --noEmit on all packages
cd apps/api && pnpm build   # Build API to dist/
cd apps/web && pnpm build   # Build frontend to dist/
```

## Architecture

**Monorepo:** pnpm workspaces + Turborepo
**Stack:** Fastify + Prisma + PostgreSQL (API) · Vite + React + TanStack Query + Tailwind (Web)

### Backend (`apps/api/src/`)

Clean Architecture per module. Dependency direction: `presentation → application → domain ← infrastructure`

```
modules/<name>/
  domain/entities/          ← pure interfaces, no Prisma
  domain/repositories/      ← interfaces (contracts)
  application/use-cases/    ← one use case = one business operation
  application/dtos/
  infrastructure/repositories/   ← Prisma implementations
  presentation/             ← Fastify routes + validators
shared/
  infrastructure/middleware/auth.middleware.ts   ← sets req.user from JWT
  infrastructure/middleware/rbac.middleware.ts   ← requirePermission() factory
  infrastructure/services/token.service.ts
  infrastructure/database/prisma.ts
  domain/errors/app.errors.ts
```

**Auth flow:** POST `/api/v1/auth/login` → JWT access token (15m) in body + refresh token in httpOnly cookie.
**RBAC:** Permissions in JWT payload (`resource:action:scope`). Admin bypasses all checks. Scope `own` is enforced at the use-case level by filtering on the actor's course assignments.

**Route typing pattern (Fastify v4):** Generic must go on the method, not the handler:
```typescript
app.get<{ Params: { id: string } }>('/path/:id', options, async (req, reply) => { ... })
```

### Frontend (`apps/web/src/`)

Feature-based: each feature owns its API calls, hooks, components and pages.

```
features/<name>/
  api/         ← TanStack Query hooks + ky API calls
  hooks/       ← business hooks (useLogin, useBulkSaveGrades...)
  components/  ← domain components (GradeTable, ActivityForm...)
  pages/       ← route-level components
shared/
  components/ui/       ← shadcn/ui primitives (Button, Input, Card, Badge...)
  components/layout/   ← AppLayout, Sidebar, Topbar
  components/feedback/ ← EmptyState, LoadingSpinner
  hooks/usePermissions.ts
  lib/api-client.ts    ← ky instance with auth + refresh interceptors
store/
  auth.store.ts        ← Zustand: user, accessToken (persisted)
  ui.store.ts          ← Zustand: sidebarCollapsed (persisted)
router/
  PrivateRoute.tsx     ← redirects to /login if not authenticated
  PermissionGuard.tsx  ← shows forbidden page if missing permission
```

**Permission check:** `usePermissions().hasPermission('resource:action:scope')`. Admin role bypasses all checks. Sidebar navigation filters itself by permissions automatically.

### Database

Prisma schema at `apps/api/prisma/schema.prisma`. All domain tables include `institution_id` (multi-tenant ready).

Key domain tables: `institutions` → `users` + `profiles` + `user_roles` → `roles` → `permissions`
Academic: `academic_years` → `academic_periods` (driven by `academic_period_schemes`)
`parallels` + `subjects` → `course_assignments` (teacher × subject × parallel × year)
`insumos` → `activities` → `grades`
`attendance_records` → `absence_justifications`

### Seed credentials
```
URL: http://localhost:5173
Email: admin@escuela.edu
Password: Admin1234!
Institution code: ESCUELA_DEMO
```

## Usabilidad para docentes y directivos

- Priorizar pocos clics y pocos datos por completar. Reutilizar el contexto y los datos ya registrados.
- Preferir selectores y opciones sugeridas, conservando la posibilidad de escribir un caso particular.
- Mostrar la siguiente acción; agrupar opciones secundarias sin ocultar tareas pendientes importantes.
- Las sugerencias requieren confirmación del usuario. No inventar hechos pedagógicos, firmas, horarios o resultados, ni decidir promociones automáticamente. Guardar notas de actividades de refuerzo confirma su cálculo según la regla institucional y debe conservar historial, sin un segundo paso de aplicar.
- Mantener separados el estado académico, la valoración del aprendizaje y la recepción de documentos.

## Key Domain Concepts

- **Periodo académico:** trimestres (default, 3) or quimestres (2) — driven by `academic_period_schemes`, never hardcoded
- **Insumo:** evaluation category created by admin per course_assignment+period; teacher assigns activities to them
- **ActivityType:** catalog table (never enum in code) — configurable by admin
- **CourseAssignment:** `UNIQUE(subject_id, parallel_id, academic_year_id)` — one teacher per subject per parallel per year
- **StudentEnrollment:** `UNIQUE(student_id, academic_year_id)` — one parallel per student per year
- **Asistencia:** recorded per `course_assignment` (subject-level), not globally per day
