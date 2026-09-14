# Plan — Proyectos Interdisciplinarios (multi-materia, multi-docente)

## Context

El usuario compartió capturas de un sistema de referencia ("TIGA") que permite crear un **Proyecto Interdisciplinario**: un reto/situación compartida por un paralelo (ej. 7EGB) durante N semanas de un trimestre, donde **≥2 asignaturas distintas** (con sus propios docentes) contribuyen cada una con su aporte disciplinar (competencia, indicador, saberes) y con actividades semana a semana (3 fases: Inicio/Desarrollo/Cierre — igual a nuestras 3 fases de `PlanningWeek`). El documento generado tiene 2 secciones clave:
- **"6. Aportes disciplinares al proyecto"**: por asignatura, tabla con Competencia curricular, Indicador, y Declarativos/Procedimentales/Actitudinales — idéntico al patrón de saberes que ya construimos.
- **"7. Integración interdisciplinaria por hitos"**: por semana, tabla con Asignatura | Fase | Actividades reales | Propósito pedagógico | Evidencias, más una síntesis "Evidencia común declarada".

Decisiones ya confirmadas: (1) el proyecto es independiente de los PUD de cada materia — cruza varios docentes/asignaturas a la vez, no pertenece a un solo PCA; (2) cada docente participante selecciona sus propias destrezas del banco curricular ya existente (mismo patrón de `WeekCard`), no texto libre.

## Approach

### Modelo (nuevo, ancla en `Parallel`+`AcademicPeriod`, no en un solo docente)

```prisma
model InterdisciplinaryProject {
  id                String   @id @default(uuid())
  institutionId     String
  parallelId        String   // el proyecto es del paralelo, no de una sola asignación
  academicPeriodId  String
  title             String
  situacionReto     String?  // "Situación/reto" del formulario de referencia
  contexto          String?
  propositoComun    String?  // "Propósito interdisciplinario"
  productoFinal     String?
  weeksCount        Int      // "Número de semanas del trimestre"
  status            String   @default("borrador") // borrador | enviado | aprobado
  createdBy         String
  createdAt / updatedAt

  parallel        Parallel
  academicPeriod  AcademicPeriod
  contributions   InterdisciplinaryContribution[]
  @@unique([parallelId, academicPeriodId, title])  // evita duplicar mismo título en el mismo trimestre
}

// Un aporte por asignatura participante — "Aportes disciplinares" (sección 6)
model InterdisciplinaryContribution {
  id                  String @id @default(uuid())
  projectId           String
  courseAssignmentId  String  // define asignatura + docente responsable de este aporte
  contribucion        String? // "Contribución" narrativa
  responsabilidad     String? // "Responsabilidad"
  skillIds            String[] // destrezas del banco elegidas por ESE docente (su área+subnivel)
  saberIds            String[] // saberes elegidos/generados (reusa CurriculumSaber existente)

  project           InterdisciplinaryProject
  courseAssignment  CourseAssignment
  weekEntries       InterdisciplinaryWeekEntry[]
  @@unique([projectId, courseAssignmentId])  // una asignatura participa una sola vez por proyecto
}

// Integración por hitos (sección 7) — una fila por semana × asignatura participante
model InterdisciplinaryWeekEntry {
  id                String @id @default(uuid())
  contributionId    String
  weekNumber        Int
  weekPropósito     String?  // "Propósito" de la semana (compartido entre asignaturas de esa semana — se guarda 1x por conveniencia, ver nota abajo)
  faseInicio        String?
  faseDesarrollo    String?
  faseCierre        String?
  propositoPedagogico String?
  evidencias        String?

  contribution  InterdisciplinaryContribution
  @@unique([contributionId, weekNumber])
}
```

Nota de diseño: `weekPropósito` (el propósito general de la semana, ej. "Comprender el reto y organizar la participación") es igual para todas las asignaturas de esa semana en el documento de referencia — se guarda redundante por fila para simplicidad de queries (no requiere tabla `ProjectWeek` intermedia); al generar el documento se toma el de la primera entrada de esa semana.

### Backend — nuevo módulo `apps/api/src/modules/interdisciplinary-projects/`
Mismo patrón exacto que `modules/planning/`: `domain` (no necesario, sigue el patrón simple de los demás módulos) → `application/dtos`, `infrastructure/repositories/prisma-interdisciplinary-project.repository.ts`, `presentation/interdisciplinary-project.routes.ts`.
- `POST /interdisciplinary-projects` (crear con datos base, sin contribuciones — cualquier docente del paralelo puede iniciarlo).
- `POST /interdisciplinary-projects/:id/contributions` (un docente se agrega a sí mismo eligiendo su `courseAssignmentId`; valida que esa asignación pertenezca al mismo `parallelId`+`academicPeriodId` del proyecto).
- `PUT /interdisciplinary-projects/:id/contributions/:contribId` (guardar destrezas/saberes/contribución/responsabilidad).
- `PUT/POST` para `InterdisciplinaryWeekEntry` (por contribución+semana, igual a como se edita `PlanningWeek`).
- `GET /interdisciplinary-projects?parallelId=&academicPeriodId=` (listar del paralelo, para que cualquier docente vea/se una a proyectos existentes).
- `GET /interdisciplinary-projects/:id/pdf` — nuevo `interdisciplinary-project-pdf.service.ts` (mismo motor de tablas ya construido en `microcurricular-pdf.service.ts`/`reinforcement-plan-pdf.service.ts`, copia el patrón de tabla de saberes con rowspan) que reproduce las secciones 6 y 7 exactas del documento de referencia.
- Permiso: reusa `planning:read/write:own` (ya existe, sin nuevo permiso).

### Frontend
- Nuevo feature `apps/web/src/features/interdisciplinary-projects/` (api + hooks, mismo patrón que `planning`).
- Nueva página `InterdisciplinaryProjectsPage` (listado por paralelo+periodo, botón crear) — accesible desde sidebar como ítem propio "Proyectos Interdisciplinarios" (no depende de entrar a un PCA específico, aprendiendo la lección de UX ya vivida con Refuerzo/IA).
- `InterdisciplinaryProjectDetailPage`: datos generales (editable mientras `borrador`) + lista de asignaturas participantes con botón "Unirme con mi asignación" (selector de `courseAssignmentId` propio) + por cada contribución ya unida, reusa el **mismo bloque de selección de destrezas+saberes de `WeekCard`** (extraído a un componente compartido `SkillAndSaberSelector` para no duplicar lógica) + grilla de semanas (Fase Inicio/Desarrollo/Cierre + Propósito + Evidencias) por cada semana × esa asignatura.
- Botón "Descargar Word/PDF" al final (mismo patrón `openSituationPdf`).

## Archivos clave
- Schema: 3 modelos nuevos + relaciones inversas en `Parallel`, `AcademicPeriod`, `CourseAssignment`, `Institution`, `User` (creator).
- Refactor pequeño: extraer el bloque de selección destreza+saberes de `WeekCard.tsx` a `apps/web/src/features/planning/components/SkillAndSaberSelector.tsx` para reusarlo aquí sin duplicar ~150 líneas.
- Nuevo módulo backend `interdisciplinary-projects/` (dtos, repository, routes, pdf service).
- Nuevo feature frontend `interdisciplinary-projects/` (api, hooks, 2 páginas).
- Sidebar + router: nueva entrada "Proyectos Interdisciplinarios".

## Verificación
- `tsc --noEmit` limpio en api y web.
- Migración aplicada sin romper datos existentes de Panamá/Demo.
- Prueba manual con 2 asignaciones reales (docentes distintos, mismo paralelo): crear proyecto, cada uno se une con su asignación, selecciona destrezas/saberes, llena 2-3 semanas, descarga el PDF y confirma que las secciones 6 y 7 coinciden con el formato de referencia compartido.
