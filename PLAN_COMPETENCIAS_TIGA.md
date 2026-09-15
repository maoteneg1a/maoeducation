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
| `default-competencies.json` | 397 competencias reales, 14 áreas, cobertura Inicial→Preparatoria→Elemental→Media→Superior→BGU (ver detalle de la expansión más abajo) |
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

## Expansión de cobertura (subniveles Elemental/Media/Superior)

La primera pasada solo cubría BGU (1BGU), Inicial y Preparatoria — el subnivel `media` (5to-7mo de Básica) quedó sin ninguna competencia, lo que se descubrió al probar con una institución real ("5to de Básica A"): el selector de competencias salía vacío para todas las materias, aunque la institución tuviera el toggle activado y las materias vinculadas a su área.

Se encontró una fuente adicional en TIGA no explorada en la primera pasada: `data/cnc_multigrade/` — 14 carpetas por materia con datos reales trazados a Excel oficial (`EXCEL_SOURCE_OBSERVED`) y PDF por subnivel, cubriendo de 2EGB a 3BGU (Matemática, Lengua, Ciencias Naturales, Ciencias Sociales, ECA, Inglés) o solo BGU (Historia, Filosofía, Física, Química, Biología, Educación para la Ciudadanía, Emprendimiento), más Educación Física por sublevel completo (Elemental/Media/Superior/Bachillerato).

Se extendió el normalizador para soportar 3 formatos de origen distintos (`datasets: list` con `grade`/`sublevel` explícito, `grades: dict[gradeCode]`, y `sublevels: dict[sublevelCode]`), mapeando cada grado/sublevel a nuestra convención de `subnivel` (`elemental`/`media`/`superior`/`bgu`), deduplicando competencias repetidas entre grados del mismo subnivel, y fusionando con los datos ya sembrados sin duplicar los 15 códigos que coincidían exactamente con la fuente original (mismo contenido, mismo código, solo diferencias de formato de salto de línea entre extracción Excel vs. PDF).

Resultado: **397 competencias, 14 áreas**, con cobertura real en todos los subniveles para las materias principales — incluyendo `Matemática/media: 12 competencias`, el caso puntual que disparó esta expansión.

## Verificación realizada

- `pnpm lint` (tsc --noEmit) limpio en los 3 paquetes en cada iteración.
- Migración generada vía diff de Prisma y aplicada manualmente en local (2 veces, por reinicios del volumen Docker — problema recurrente de la sesión, no del código).
- Seed completo corrido de punta a punta 2 veces desde cero, sin errores, con conteos finales verificados en BD: 104 competencias, 323 indicadores, 1138 saberes, 7 competencias clave, 31 checkpoints DUA/148 estrategias, catálogo de evaluación completo, 2771 candidatos de inserción.
- Endpoint `GET /curricular-insertions/candidates` probado end-to-end con servidor real + login real + JWT, iterando el algoritmo de matching hasta lograr precisión (coincidencia exacta + 1 nivel de generalización, con y sin prefijo `CE.`).

## Comparación exhaustiva contra TIGA — qué tiene TIGA que a Auleka le falta

Investigación completa del resto del código de TIGA (multigrado, generadores Word, NEE, socioemocional, dosificación anual, refuerzo, coherencia interdisciplinaria, carga horaria, iconografía). Resumen por área, priorizado por ROI al final.

### 1. Modo MULTIGRADO (unidocente) — GAP GRANDE, pedido explícito del usuario

TIGA tiene un sistema de 5 capas, todas de solo-lectura/validación sobre contenido ya generado por el motor normal de 1 grado (no genera nada nuevo, coordina lo existente):
- `multigrade_planning_domain.py`: construye un contexto por cada (grado, materia, competencia).
- `multigrade_planning_orchestrator.py`: agrupa ≥2 de esos contextos con la misma duración en semanas (todo o nada).
- `multigrade_coherence_engine.py`: vista puramente factual que alinea las semanas de cada grado lado a lado y clasifica pares como misma familia de progresión o independientes — nunca genera contenido.
- `multigrade_methodology_coordinator.py` / `multigrade_assessment_coordinator.py`: el docente toma actividades YA EXISTENTES de cada grado y las marca como **compartidas** (misma tarea, con coordinación de aula), **diferenciadas** (misma actividad base + adaptación por grado), o **independientes**.
- `multigrade_word_generator.py`: DOCX con tablas por grado lado a lado. Explícitamente excluye BGU — es solo EGB.

Hoy en Auleka, un profesor con varios `CourseAssignment` simultáneos (el caso real de unidocente) planifica cada uno de forma totalmente aislada, sin vista de coherencia ni forma de compartir/diferenciar actividades entre grados.

**Tamaño: grande.** Requeriría: UI para seleccionar 2+ `CourseAssignment` del mismo docente/periodo, motor de coherencia (comparar `competencyIds`/progresión entre `PlanningWeek` de distintos cursos), modelo de "actividad compartida/diferenciada/independiente" por semana, y un layout multi-columna en el PDF de Planificación Microcurricular.

### 2. Generadores de documentos Word

Estructuralmente equivalentes a nuestro motor de PDFKit (tablas, sombreado, bandas de sección). **No aplica como gap de formato** — DOCX vs PDF es preferencia de plataforma, no funcionalidad faltante. El contenido adicional relevante que sí aportan está cubierto en los hallazgos #1 y #10c.

### 3. `disaggregation_repository.py` / `disaggregation_ui.py` — no aplica

Herramienta de curación de datos (cómo el equipo de TIGA construyó su propio banco de Lengua BGU), no una feature para el docente final. Ya importamos el banco final, no necesitamos el proceso de desagregación.

### 4. Socioemocional — GAP PEQUEÑO-MEDIANO

Detector determinista (sin IA) que evalúa si el contexto de la semana amerita una intervención socioemocional y propone 1 de 9 estrategias fijas (trabajo en equipo, comunicación asertiva, manejo de conflicto, empatía, pensamiento ético, toma de decisiones, gestión de problemas, pensamiento creativo, autorregulación) con actividad integrada y seguimiento por estados (Planificado→En implementación→Monitoreado→Cerrado). Es por semana/actividad, no longitudinal por estudiante.

Ya tenemos el eje de inserción socioemocional como banco de texto (2771 candidatos), pero no el catálogo estructurado de 9 estrategias ni el flujo de seguimiento con estados.

### 5. NEE/Inclusión — GAP en dos partes

**(a) Catálogo de 13 estrategias de apoyo NEE reales** (visual, segmentación de instrucciones, modelado, material manipulativo, apoyo comunicacional, respuesta alternativa, tiempo extendido, reducción de carga simultánea, práctica guiada, accesibilidad, apoyo de lectura, apoyo entre pares, autorregulación) — cada una con barreras aplicables, fases DUA compatibles, nivel de apoyo (ajuste razonable vs. apoyo individual), si requiere autorización formal, y códigos DUA cruzados. **Tamaño: pequeño** — mismo patrón que nuestro catálogo DUA, ya probado.

**(b) Expediente NEE versionado y longitudinal por estudiante** (revisiones, reevaluaciones periódicas, historial de decisiones) — nosotros solo tenemos `StudentEnrollment.hasAdaptation` + un `ReinforcementPlan` plano por periodo. **Tamaño: mediano** — requiere tabla nueva + versionado + workflow de reevaluación.

### 6. Carga horaria oficial — GAP PEQUEÑO

`curricular_workload.py` resuelve horas semanales OFICIALES por materia/grado desde una tabla MINEDUC real (36 entradas, con casos de bloques agrupados como "ECA-EF"), citando el acuerdo ministerial. Hoy `CourseAssignment`/`ScheduleEntry` no valida contra la norma — el admin escribe cualquier número. **Tamaño: pequeño** — importar 1 JSON de 36 filas + lookup opcional.

### 7. `pedagogical_planning_context.py` — no aplica

Patrón de adaptador interno de TIGA para desacoplar sus generadores de Word de sus 2 modos de planificación. Nuestro enfoque más simple (branch `isCompetencyModel` en cada punto de uso) resuelve el mismo problema a nuestra escala.

### 8. Motor determinista (`methodology_engine.py`) — GAP MEDIANO

El de TIGA es más sofisticado: clasifica el perfil pedagógico del contenido por palabras clave (ej. dominio matemático: modelado/representación/razonamiento), y por perfil+fase combina VARIAS estrategias DUA en un bloque (no 1 sola fija como la nuestra), con control de densidad según la carga horaria real. Nuestro `pedagogical-methodology.ts` siempre elige la misma primera estrategia/técnica sin importar el contenido — funciona pero es mucho menos relevante cuando la IA falla y cae al fallback.

### 9. Iconografía — no aplica

Utilidades de empaquetado desktop/Word y curación de datos, ya cubiertas en espíritu por los colores de `KeyCompetency` que ya importamos.

### 10. Otros hallazgos

**(a) Dosificación pedagógica anual — GAP GRANDE.** Servicio que asigna competencias/indicadores/saberes a trimestres ANTES de planificar semana por semana, con modo de asignación (foco principal vs. refuerzo recurrente), etapa esperada por trimestre (introducido→desarrollado→reforzado→consolidado), tracking de estado por elemento, y reasignación entre trimestres con razón obligatoria auditada. Nuestro `CurriculumPlan.data: Json` es un blob libre sin ninguna de estas garantías — el PCA no "sabe" qué se ha cubierto. **Tamaño: grande.**

**(b) Motor de ciclo de refuerzo — GAP GRANDE, más alto ROI dado "mínimo esfuerzo docente".** Generador determinista de un ciclo de refuerzo de N semanas completo: fases progresivas (exploración/recuperación→modelado→práctica guiada→aplicación→transferencia→verificación), con objetivo/estrategia/actividad/recurso/evidencia/criterio de avance/próximo paso por semana, más un catálogo de 8 necesidades pedagógicas no-diagnósticas (comprensión, aplicación, razonamiento, producción/comunicación, autonomía, ritmo, participación, cumplimiento) cada una con estrategia pre-redactada. Nuestro `ReinforcementPlan` es un documento plano de texto libre sin estructura semanal. **Tamaño: mediano-grande, pero el de mayor ROI directo** — se adaptaría casi 1:1 generando `PlanningWeek`-like entries dentro del plan de refuerzo.

**(c) Coherencia interdisciplinaria trazada — GAP MEDIANO/ARQUITECTÓNICO.** TIGA traza cada hito semanal del proyecto interdisciplinario de vuelta a la actividad/evidencia curricular REAL de cada materia (no texto libre), validando que las contribuciones conecten de verdad con lo que se enseña esa semana. Nuestro `InterdisciplinaryWeekEntry` es texto libre sin vínculo a `PlanningWeek` — no hay garantía de que lo escrito en el proyecto coincida con lo que el docente realmente da esa semana en su materia. **Tamaño: mediano, pero es un cambio de modelo** (de texto libre a referencias), no solo aditivo.

**(d) Calendario académico institucional — no aplica.** Nuestro `AcademicYear`/`AcademicPeriod` real en BD ya es más completo que el de TIGA.

### Resumen priorizado (mayor a menor ROI)

1. **Motor de ciclo de refuerzo** (10b) — alto valor, alineado directo con "mínimo esfuerzo docente".
2. **Dosificación pedagógica anual** (10a) — el PCA deja de ser texto libre y gana trazabilidad real.
3. **Modo multigrado/unidocente** (1) — pedido explícito del usuario, pero la más grande de construir.
4. **Catálogo NEE de 13 estrategias** (5a) — pequeño, mismo patrón que el catálogo DUA ya probado.
5. **Carga horaria oficial** (6) — trivial.
6. **Socioemocional con seguimiento por estados** (4) — mediano.
7. **Motor determinista más inteligente** (8) — mediano, mejora de calidad del fallback.
8. **Expediente NEE versionado** (5b) y **coherencia interdisciplinaria trazada** (10c) — ambos arquitectónicos, dejar para cuando el producto madure más.

## Pendiente adicional / fuera de alcance de esta ronda

- UI de creación de destrezas/competencias/saberes personalizados por institución (existe para destrezas vía `createCustomSkill`, no se replicó el equivalente para competencias).
- El catálogo DUA/evaluación no tiene UI de administración (son fijos, sembrados una vez) — si se necesita ajustarlos por institución, requiere trabajo adicional.
