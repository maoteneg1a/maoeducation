# Acuerdo MINEDEC-MINEDEC-2026-00082-A — Alertas tempranas, refuerzo e informes en Auleka

Análisis de cumplimiento y diseño de implementación. Fecha: 2026-10-23.

## Decisiones de producto

- **Sin planificación y sin destrezas/competencias.** Todo el flujo se apoya solo en el motor de notas de Auleka (`apps/api/src/shared/domain/grade-math.ts`) y en la unidad estudiante × asignación × periodo. Ningún módulo de este flujo importa de `planning` ni valida destrezas planificadas.
- **Los documentos son INFORMES escritos** que una instancia de la escuela envía a otra (docente → tutor → equipo de bienestar / DECE → autoridad / junta; docente ↔ representante), con acuse de recepción, inmutables al enviarse.
- **El representante no sube archivos.** Solo el personal de la escuela adjunta evidencias.
- **No se genera un PDF único**: cada informe tiene su PDF y los anexos se descargan por separado.
- **Todo es parametrizable por institución (multi-escuela).** Los valores del acuerdo son un *preset*, nunca constantes en el código. Si una institución fiscal se aparta de una regla obligatoria, el sistema advierte pero no bloquea.
- **Instituciones existentes: opt-in.** Las reglas nuevas del motor (truncado, rango de supletorio, tope del refuerzo, etc.) solo se aplican cuando la institución activa el marco 2026-00082-A. Las instituciones nuevas nacen con él activo.

## 1. Lo que pide el acuerdo (resumen operativo)

| Artículo | Regla |
|---|---|
| 4 | Alertas tempranas → activar el Equipo Institucional de Cuidado y Respuesta para el Bienestar Estudiantil. Informe de aprendizajes gratuito y regular. |
| 7 | Escala cualitativa A+…E-: A/B alcanzado, C en proceso, D/E iniciado. |
| 8 | Escala 1,00–10,00; promedios con dos decimales **truncados**. |
| 10 | Detección: formativas 0,01–6,99 (o E-…C+) → informar a la familia → refuerzo → refuerzo promediado hasta 7,00 → psicopedagógica (coordinado con autoridad) → DECE si hay riesgo psicosocial. |
| 11–14 | Mejora de **sumativas**: directa (7–9, hasta 9,00; 1 por asignatura, 3 al año) y con refuerzo (0,01–6,99, hasta 7,00; 2 por asignatura, 6 al año). Formativas: mecanismos propios de la institución. |
| 18 | Evaluación atrasada sin justificación → se registra **1**. |
| 20 | Promoción automática en Inicial, Preparatoria y Elemental. |
| 21 | Promoción directa con ≥ 7,00 en **cada** asignatura. |
| 22 | Supletorio: nota máxima 7,00, registrada como promedio final. |
| 23 | Supletorio con promedio 4,01–6,99. |
| 25 | Superior y BGU: ≤ 4,00 → repitencia directa. |
| 27 | Media: ≤ 4,00 → refuerzo + compromisos; la junta puede promover. |
| 29 | Resultados socioemocionales confidenciales. |
| 36 | 70 % formativa / 30 % sumativa (obligatorio fiscal, referencial otros). |
| 39 | Informe por parcial: resultados, **recomendaciones** y comportamiento. |
| Trans. 8 | Costa–Galápagos 2026-2027 sigue con el Acuerdo 2024-00031-A; Sierra–Amazonía aplica desde el 1-sep-2026. |

La lista de 13 "documentos básicos en caso de reprobar" que piden los distritos **no está en el acuerdo**: es práctica de supervisión. Por eso el expediente es una plantilla configurable cuyo valor por defecto es esa lista.

## 2. Brechas de Auleka frente al acuerdo (antes de esta implementación)

| # | Regla | Estado previo | Ubicación |
|---|---|---|---|
| 1 | Art. 7 escala A+…E- | Default DAR/AAR/PAAR/NAAR y escala de valor con F- | `institution-bootstrap.ts` |
| 2 | Art. 8 truncado | `toFixed(2)` redondea | `bulletin-pdf.service.ts`, motor |
| 3 | Art. 23 supletorio 4,01 | `supletorioMin: 5.0` | `institution-bootstrap.ts` |
| 4 | Art. 25 repitencia directa ≤ 4,00 | Se envía a `remedial` | `prisma-promotion.repository.ts` |
| 5 | Art. 21 cada asignatura ≥ 7 | `maxFailedSubjects: 1` | `institution-bootstrap.ts` |
| 6 | Art. 22 tope 7,00 del supletorio | Solo compara `>= passWithExam` | `prisma-promotion.repository.ts` |
| 7 | Art. 20 promoción automática | No distingue subnivel | promoción |
| 8 | Art. 27 excepción Media | No existe | — |
| 9 | Art. 10.4 refuerzo promediado ≤ 7 | Default `replace`, sin tope | `prisma-activity.repository.ts` |
| 10 | Art. 11–12 mejora sumativa y topes | No existe | — |
| 11 | Art. 18 atrasada sin justificar = 1 | `no_realizado` = 0 | `prisma-activity.repository.ts` |
| 12 | Art. 39 recomendaciones | La boleta no las tiene | `bulletin-pdf.service.ts` |
| 13 | Trans. 8 marco por año/régimen | El régimen no se persiste | `institution-bootstrap.ts` |
| 14 | Sostenimiento | No existe | — |

## 3. Diseño de parametrización

Todo vive en `Institution.settings` (JSON) con fallback a defaults, siguiendo el patrón de `extractGradingConfig`.

### 3.1 Perfil normativo — `settings.normativeProfile`

```ts
{
  sostenimiento: 'fiscal' | 'particular' | 'fiscomisional' | 'municipal',
  regime: 'SIERRA_AMAZONIA' | 'COSTA_GALAPAGOS',
  framework: 'MINEDEC-2026-00082-A' | 'LEGACY',
  frameworkByYear: { [academicYearId]: framework },
}
```

### 3.2 Reglas del acuerdo — `settings.gradingConfig.agreement`

Truncado, alertas tempranas (fuente, momento, rangos, códigos cualitativos), refuerzo formativo (tope), mejora sumativa (rangos, topes y límites), evaluación atrasada (nota por no presentarse), promoción por subnivel (automática, supletorio, repitencia directa, excepción de Media, tope del supletorio), y ponderación.

### 3.3 Flujo de informes — `settings.reportsFlow`

- `instances`: instancias de la escuela y cómo se resuelven (tutor del paralelo, rol, usuarios concretos, representantes del estudiante).
- `reportTypes`: catálogo editable de tipos de informe (etiqueta, quién lo emite, a qué instancia va, plazo de acuse, a quién se escala, encabezado del PDF, si lo dispara la alerta).
- `dossier`: lista del expediente (tipo de informe, mínimo, si es por asignatura, subniveles a los que aplica).
- `attachments`: categorías, visibilidad por rol, tipos MIME y tamaño. El representante nunca sube.

### 3.4 Permisos (RBAC por institución)

`early_alert:read:own|all`, `formal_report:send:own`, `formal_report:read:all`, `reinforcement_case:read:all`, `reports_flow:manage:all`.

## 4. Modelo de datos nuevo

- `EarlyAlert` — estudiante × asignación × periodo, nota de origen (snapshot), estado (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `DISMISSED`).
- `FormalReport` — informe con folio, tipo, autor, instancia destino, contenido, snapshot de notas, estado (`DRAFT → SENT → RECEIVED → (RETURNED) → ATTENDED`), acuse, cadena de derivación, hash de contenido.
- `FormalReportAttachment` — anexos (referencia a adjuntos del caso o archivos propios).
- `ReinforcementAttachment` — archivos del caso de refuerzo, por categoría.
- `ReinforcementSession` + asistencia por participante.

## 5. Orden de implementación

1. Perfil normativo y corrección del motor (opt-in).
2. Configuración del flujo (instancias, informes, adjuntos) y su pantalla.
3. Alertas tempranas.
4. Caso de refuerzo: consulta por rol, adjuntos, sesiones con asistencia, notas del motor.
5. Motor de informes: envío, acuse, escalamiento, derivación, PDF con folio.
6. Expediente con checklist configurable.

## 6. Implementación (rama `feat/acuerdo-00082a-alertas-informes`)

### Backend
| Pieza | Ubicación |
|---|---|
| Reglas del acuerdo (preset, resolución por año, cálculo, cumplimiento) | `apps/api/src/shared/domain/agreement-rules.ts` (+ tests) |
| Catálogo de informes, instancias, expediente y adjuntos | `apps/api/src/shared/domain/reports-flow.ts` (+ tests) |
| Configuración por institución | `GET/PUT /institution/normative-profile`, `POST …/apply-preset`, `GET/PUT /institution/reports-flow`, `POST …/reset` |
| Motor: refuerzo/mejora con topes y límites, no presentado = 1, truncado | `prisma-activity.repository.ts`, `grade-math.ts`, `grade-reinforcement.service.ts` |
| Promoción: automática, supletorio 4,01–6,99 con tope 7, repitencia directa, junta | `prisma-promotion.repository.ts` |
| Alertas tempranas | `/early-alerts` (lista con recálculo, resumen, descartar, reabrir, vincular caso) |
| Informes formales | `/formal-reports` (borrador, envío con folio, acuse, devolución, atención, derivación, versiones, escalamiento, anexos, PDF) |
| Expediente | `GET /formal-reports/dossier` |
| Caso de refuerzo: consulta, sesiones con asistencia, archivos | `/reinforcement-desk/cases…` |
| Recomendaciones de la boleta (art. 39) | `GET/PUT /bulletin-recommendations` + PDF de la boleta |
| Migración (tablas + permisos para escuelas existentes) | `prisma/migrations/20261031000000_agreement_alerts_reports` |

### Frontend
| Pantalla | Ruta |
|---|---|
| Marco normativo, reglas, informes e instancias, expediente y adjuntos | `/settings/normativa` |
| Alertas tempranas (por asignatura, por paralelo, señales generales) | `/academic-alerts` |
| Bandeja y detalle de informes | `/informes`, `/informes/:id` |
| Casos de refuerzo (resumen, sesiones y asistencia, archivos, informes) | `/refuerzo/casos`, `/refuerzo/casos/:id` |
| Recomendaciones del informe de aprendizajes | `/recomendaciones` |
| Expediente de respaldo | pestaña en la carpeta del estudiante |
| Acuse del representante | tarjeta en el inicio de familias |

### Pendiente de verificar en un entorno con base de datos
- Aplicar la migración y probar los flujos de punta a punta (no había PostgreSQL disponible al implementar).
