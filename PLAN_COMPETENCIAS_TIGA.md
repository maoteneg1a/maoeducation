# Planificación por Competencias (CNC-MINEDUC) — integración inspirada en TIGA

## Contexto

Auleka planificaba exclusivamente por **destrezas** (Currículo Priorizado con Énfasis en Competencias, `CurriculumArea → CurriculumCriterion → CurriculumSkill → CurriculumSaber`). El usuario pidió agregar un segundo modelo de planificación por **competencias** (Currículo Nacional por Competencias, CNC), inspirado en el enfoque real de un sistema de escritorio llamado TIGA (con el que Auleka se va a integrar en la parte de planificación), configurable por institución — sin romper nada del modelo de destrezas existente.

De TIGA se tomaron dos ideas concretas, con autorización confirmada para reutilizar sus datos curados:

1. **Modelo por competencias con datos reales del MINEDUC** (competencia específica → indicadores → saberes, sin nivel "criterio" intermedio — la competencia específica lo reemplaza), más un catálogo fijo de 7 competencias clave transversales.
2. **Motor de IA en dos capas**: una capa determinista (reglas + catálogos, sin LLM, siempre disponible) y una capa de IA que la mejora pero se valida agresivamente antes de aceptarse — nunca confía ciegamente en la respuesta del modelo.

## Alcance final

### 1. Modelo de datos (Prisma)

Migración `20260916000000_competency_planning_model`. Nuevos modelos:

- **Banco de competencias** (paralelo a destrezas): `CompetencyArea → Competency (subnivel + código + texto) → CompetencyIndicator` + `CompetencySaber` (mismo patrón declarativo/procedimental/actitudinal que `CurriculumSaber`).
- **`KeyCompetency`**: catálogo fijo global (no por institución) de las 7 competencias clave (CC, CMCT, CCICC, CD, CSE, CECA, CIT), con nombre, descripción, color oficial.
- **Catálogos operativos globales** (compartidos por ambos modelos de planificación):
  - `DuaCheckpoint` + `DuaStrategy` — 31 checkpoints DUA (CAST 2.2), cada uno con estrategias prácticas ya redactadas, filtrables por fase pedagógica (`ANTICIPATION`/`CONSTRUCTION`/`CONSOLIDATION`, mapeadas 1:1 a nuestros 3 momentos: anticipación/construcciónConocimiento/consolidación).
  - `AssessmentTechnique` + `AssessmentInstrument` — taxonomía cerrada de 7 técnicas y 9 instrumentos de evaluación, con compatibilidad técnica↔instrumento.
- **`CurricularInsertionBank` + `CurricularInsertionCandidate`** — 5 bancos de ejes de inserción curricular transversal (socioemocional, desarrollo sostenible, cívica/ética, seguridad vial, educación financiera), con ~2771 candidatos textuales referenciados a un código de destreza/competencia del documento fuente. Son solo referencia — no bloquean ni se auto-aplican.
- **Campos paralelos agregados** a los modelos existentes, para que todo lo que ya usaba destrezas también soporte competencias:
  - `PlanningWeek.competencyIds` / `competencyIndicatorIds` / `competencySaberIds`
  - `Activity.competencyId` (equivalente a `curriculumSkillId`)
  - `InterdisciplinaryContribution.competencyIds` / `competencySaberIds`
  - `ReinforcementPlanSkill.competencyId` (con `curriculumSkillId` vuelto opcional — exactamente uno de los dos se usa)
  - `Subject.competencyAreaId` (equivalente a `curriculumAreaId`)

### 2. Datos reales importados

Normalizados desde las fuentes de TIGA (`prisma/seeds/curriculum/*.json`, nuevos archivos):

| Archivo | Contenido |
|---|---|
| `default-competencies.json` | 104 competencias reales: BGU (Matemática + Lengua, 1BGU), Inicial (3-4 y 4-5 años), Preparatoria (integrada + EF + ECA especializadas) |
| `key-competencies.json` | 7 competencias clave con descripción oficial y color |
| `dua-catalog.json` | 31 checkpoints DUA, 148 estrategias, con fase y propósito compatible |
| `assessment-catalog.json` | 7 técnicas + 9 instrumentos de evaluación, transcritos de `assessment_engine.py` |
| `insertion-banks.json` | 5 bancos, 2771 candidatos de inserción curricular |

Se siembran vía `institution-bootstrap.ts` (banco de competencias por institución, igual que destrezas) y `prisma/seeds/index.ts` (catálogos globales, una sola vez, idempotente).

**Nota de calidad de datos**: el normalizador (`/tmp/build_competency_seed.py`, no versionado — solo se usó para generar los JSON finales) corrigió automáticamente ~11 indicadores con código embebido en el texto en vez de campo separado, y 2 grupos de saberes duplicados dentro de la misma competencia — inconsistencias del documento fuente original de TIGA, no de nuestra normalización.

### 3. Motor de IA en dos capas

Nuevo servicio `apps/api/src/modules/ai-assistant/application/services/competency-pedagogical-generator.service.ts`:

- **Capa determinista** (`apps/api/src/shared/domain/pedagogical-methodology.ts`, función pura): compone metodología de 3 fases + evaluación seleccionando 1 estrategia DUA compatible con cada fase y 1 técnica/instrumento válido de los catálogos reales — sin LLM, siempre disponible, resultado plantillado pero coherente.
- **Capa IA**: llama a Claude con un `tool_choice` estructurado (contexto de competencia+indicador+catálogo DUA permitido+catálogo de evaluación permitido), y valida la respuesta agresivamente antes de aceptarla (`apps/api/src/shared/domain/pedagogical-validation.ts`): código de identidad no alterado, actividad ≥8 palabras y no genérica, cada recurso mencionado aparece literalmente en el texto de la actividad, técnica/instrumento pertenecen al catálogo y son compatibles entre sí, evidencia distinta del texto de la actividad, alineación por superposición de palabras con el indicador. Si falla, reintenta 1 vez con un prompt de corrección con los errores específicos; si vuelve a fallar, cae a la capa determinista.
- El resultado expone `generationMode: 'AI_ENHANCED' | 'AI_FALLBACK'` — el frontend (`WeekCard.tsx`) muestra un badge de advertencia cuando fue fallback, para transparencia con el docente.

Ruta nueva: `POST /ai-assistant/draft-competency-week`.

### 4. Motor central extendido

`apps/api/src/shared/infrastructure/services/planned-curriculum.service.ts` ya restringía destrezas en actividades/refuerzo/proyectos interdisciplinarios a solo lo ya planificado (`PlanningWeek`). Se agregó la rama simétrica para competencias (`getPlannedCompetencyIds` / `assertCompetenciesArePlanned`), conectada en los mismos 3 puntos de escritura.

### 5. `draftProject` (generación completa de proyecto interdisciplinario con IA)

Extendido para bifurcar según el `planningModel` activo de la institución: el prompt, el catálogo ofrecido a la IA, y la persistencia final (skillIds vs. competencyIds, curriculumSaber vs. competencySaber) cambian según el modelo, sin duplicar el servicio completo.

### 6. Detección automática de refuerzo

`getSkillReinforcementCandidates` agrupaba solo por `Activity.curriculumSkillId`. Se extendió para agrupar también por `Activity.competencyId`, devolviendo candidatos discriminados (`curriculumSkillId?` / `competencyId?`).

### 7. PDFs

Los 3 generadores (Planificación Microcurricular, Proyecto Interdisciplinario, Plan de Refuerzo) solo leían destrezas. Se extendieron para resolver y mostrar competencias cuando la semana/contribución/plan las usó, sin tocar el motor de renderizado (mismo shape de datos, fuente distinta).

### 8. Frontend

- **Config admin** (`GradingConfigPage.tsx`): toggle `planningModel` (destrezas | competencias).
- **`SubjectsPage.tsx`**: selector de área curricular/de competencias al crear/editar materia (gap preexistente para destrezas también, cerrado de paso).
- **`CompetencyAndSaberSelector.tsx`**: componente hermano de `SkillAndSaberSelector`, mismo patrón de búsqueda+checkbox+saberes por tipo.
- **`WeekCard.tsx`**, **`ContributionCard.tsx`**, **`ActivitiesPage.tsx`**, **`ReinforcementPlansList.tsx`**: todos bifurcan el selector correcto según `planningModel` activo.
- **`CurricularInsertionSuggestions.tsx`**: panel colapsable en la planificación semanal con sugerencias de ejes de inserción curricular relevantes a lo ya seleccionado (matching por código, probado end-to-end contra datos reales).

## Verificación realizada

- `pnpm lint` (tsc --noEmit) limpio en los 3 paquetes en cada iteración.
- Migración generada vía diff de Prisma y aplicada manualmente en local (2 veces, por reinicios del volumen Docker — problema recurrente de la sesión, no del código).
- Seed completo corrido de punta a punta 2 veces desde cero, sin errores, con conteos finales verificados en BD: 104 competencias, 323 indicadores, 1138 saberes, 7 competencias clave, 31 checkpoints DUA/148 estrategias, catálogo de evaluación completo, 2771 candidatos de inserción.
- Endpoint `GET /curricular-insertions/candidates` probado end-to-end con servidor real + login real + JWT, iterando el algoritmo de matching hasta lograr precisión (coincidencia exacta + 1 nivel de generalización, con y sin prefijo `CE.`).

## Pendiente / fuera de alcance de esta ronda

- **Multigrado (unidocente/pluridocente)**: TIGA tiene un motor separado (`multigrade_*.py`) para coordinar la planificación cuando un docente da clase simultánea a varios grados. Auleka hoy opera a nivel `CourseAssignment` (materia+paralelo+año), que funciona igual para pluridocente (un profesor, varias asignaciones) sin cambios — pero la coordinación/coherencia entre grados de un mismo unidocente NO se replicó. Ver comparación detallada más abajo.
- UI de creación de destrezas/competencias/saberes personalizados por institución (existe para destrezas vía `createCustomSkill`, no se replicó el equivalente para competencias).
- El catálogo DUA/evaluación no tiene UI de administración (son fijos, sembrados una vez) — si se necesita ajustarlos por institución, requiere trabajo adicional.
