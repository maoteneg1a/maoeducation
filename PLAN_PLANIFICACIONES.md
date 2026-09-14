# Plan — Buscador de destrezas + Plan de Refuerzo Individualizado (NEE)

## Context

Dos brechas detectadas usando el sistema en vivo con Hilda:

1. **Buscador de destrezas**: el selector de `WeekCard` lista 20-80 destrezas por materia+subnivel sin filtro — encontrar la correcta a mano rompe la premisa de "mínimo esfuerzo".
2. **Plan de Refuerzo Individualizado**: hoy el sistema *detecta* automáticamente candidatos a refuerzo por destreza (`getSkillReinforcementCandidates`) y permite marcar adaptación NEE (`StudentEnrollment.hasAdaptation`), pero no existe un **documento formal por estudiante** que la institución pueda imprimir/archivar — lo que ahora piden. No hay formato oficial que replicar (a diferencia del PUD), así que se diseña una estructura razonable basada en lo que ya existe: destreza detectada, tipo de necesidad, estrategias, seguimiento y firmas — reusando exactamente los datos que ya calculamos (no se inventa un modelo de detección nuevo).

## Approach

### A. Buscador de destrezas (frontend, sin cambios de backend)

En `apps/web/src/features/planning/components/WeekCard.tsx`, el bloque `availableSkills.map(...)`:
- Agregar un `<Input>` de búsqueda arriba de la lista (mismo componente `Input` ya usado en el archivo).
- Filtrar en memoria por `code` o `description` (case-insensitive, sin acento-sensibilidad básica) — no requiere endpoint nuevo, la lista ya está cargada completa por materia+subnivel vía `useCurriculumSkillsForSubject`.
- Mantener las destrezas ya seleccionadas visibles aunque no calcen el filtro (para no "perder" la selección de vista) — mostrar seleccionadas primero o fijarlas arriba.

### B. Plan de Refuerzo Individualizado (documento por estudiante)

**Modelo (extiende `PedagogicRecovery`, no crea tabla nueva de detección — reusa lo que ya existe):**

Nuevo modelo `ReinforcementPlan` (1 por estudiante × curriculumSkill × periodo, o consolidado por estudiante×periodo con varias destrezas dentro — se decide: **un plan por estudiante+periodo que agrupa N destrezas**, porque así se imprime un solo documento por alumno en vez de uno por destreza):

```prisma
model ReinforcementPlan {
  id                 String   @id @default(uuid())
  institutionId      String
  studentId          String
  courseAssignmentId String
  academicPeriodId   String
  // "academico" (detectado por notas bajas) | "nee" (por adaptación curricular)
  planType           String
  status             String   @default("borrador") // borrador | activo | cerrado
  objetivoGeneral    String?
  estrategias        String?
  responsables       String?  // docente, DECE, familia...
  fechaInicio        DateTime?
  fechaSeguimiento   DateTime?
  observacionesFinales String?
  createdBy          String
  createdAt / updatedAt

  skills ReinforcementPlanSkill[]  // destrezas puntuales cubiertas por este plan, con su nota/estado
  @@unique([studentId, courseAssignmentId, academicPeriodId])
}

model ReinforcementPlanSkill {
  id                  String @id
  planId              String
  curriculumSkillId    String
  averageAtDetection   Decimal?   // nota que disparó la detección (o null si es por NEE)
  notes                String?
}
```

**Backend** (`apps/api/src/modules/pedagogic-recovery/`, mismo módulo — es una extensión natural, no un módulo nuevo):
- `createReinforcementPlan`: recibe `studentId + courseAssignmentId + academicPeriodId + skillIds[]` — si `skillIds` viene vacío y el estudiante tiene `hasAdaptation=true`, se marca `planType='nee'`; si vienen skills, se pre-llenan desde `getSkillReinforcementCandidates` (mismo cálculo ya existente, reusado).
- `updateReinforcementPlan`, `listReinforcementPlans` (por asignación+periodo, para que el docente vea todos los planes activos de su curso).
- `getReinforcementPlanPdfData` + nuevo `reinforcement-plan-pdf.service.ts` (pdfkit, mismo patrón de tablas que `microcurricular-pdf.service.ts`): encabezado institución, datos del estudiante, tipo de plan, tabla de destrezas cubiertas (código + descripción + nota que disparó + estado), objetivo/estrategias/responsables, fila de seguimiento, pie de firmas (docente, representante, DECE si es NEE).
- Ruta nueva `GET/POST/PUT /pedagogic-recovery/reinforcement-plans` + `GET /pedagogic-recovery/reinforcement-plans/:id/pdf`.
- Permiso: reusa `grades:write:own` (mismo scope que ya usa todo el módulo de recuperación) — no se crea un permiso nuevo.

**Frontend:**
- Extender `SkillReinforcementPanel.tsx` (donde ya se muestran los candidatos detectados): agregar botón "Crear plan de refuerzo" por estudiante/destreza que abre un formulario simple (objetivo, estrategias, responsables, fecha de seguimiento) y llama a `createReinforcementPlan`.
- Nueva pequeña página/lista `ReinforcementPlansPage` (o sección dentro de la página de Recuperación existente) que lista los planes activos del curso con botón "PDF" por cada uno (mismo patrón `openSituationPdf` ya usado en planning.api.ts).
- Para NEE: en `EnrollmentPage` (donde ya está el diálogo de adaptación), agregar acceso directo a "Crear plan de refuerzo NEE" para estudiantes con `hasAdaptation=true`.

## Archivos clave
- Nuevo: modelos `ReinforcementPlan`/`ReinforcementPlanSkill` en `schema.prisma` + migración.
- Editar: `apps/api/src/modules/pedagogic-recovery/{application/dtos,infrastructure/repositories,presentation}` — agregar métodos/rutas.
- Nuevo: `apps/api/src/modules/pedagogic-recovery/application/services/reinforcement-plan-pdf.service.ts`.
- Editar: `apps/web/src/features/planning/components/WeekCard.tsx` (buscador).
- Editar: `apps/web/src/features/pedagogic-recovery/components/SkillReinforcementPanel.tsx` (botón crear plan).
- Nuevo: `apps/web/src/features/pedagogic-recovery/pages/ReinforcementPlansPage.tsx` (o sección embebida).

## Verificación
- `tsc --noEmit` limpio en api y web.
- Migración aplicada, seed de Panamá no roto (correr de nuevo, debe seguir siendo idempotente).
- Prueba manual: en `WeekCard`, escribir en el buscador filtra la lista en vivo. En el panel de refuerzo detectado, crear un plan, verificar que aparece en la lista, descargar su PDF y confirmar que la tabla de destrezas/notas se ve correcta.
