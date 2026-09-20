# Análisis de consumo de la API de Anthropic — módulo `ai-assistant`

> Contexto: Auleka es un sistema de gestión escolar (Fastify + Prisma + Postgres backend, React frontend). El asistente de planificación pedagógica usa la API de Anthropic (Sonnet 4.6) con una sola API key para toda la plataforma (nunca BYOK). El gasto se disparó: **1.07M input tokens en pocas horas por una sola institución** en un día reciente, y ~$7-8/día en una sola escuela. Ya se aplicaron algunas mitigaciones (ver "Qué ya se hizo" al final) pero se busca seguir bajando costo sin perder calidad pedagógica.

## Cliente de Anthropic (único, compartido)

`apps/api/src/modules/ai-assistant/infrastructure/services/anthropic-client.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../../../config/env'

let client: Anthropic | null = null

/** Cliente único server-side (una sola API key para toda la plataforma — nunca BYOK). */
export function getAnthropicClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no configurada — el asistente IA no está disponible')
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  return client
}

export function isAnthropicConfigured(): boolean {
  return !!env.ANTHROPIC_API_KEY
}
```

Modelo configurado por institución (`aiConfig.model`), default `claude-sonnet-4-6` — ninguna institución usa un modelo distinto salvo que un superadmin lo cambie manualmente desde el panel de plataforma.

## Los 5 generadores — resumen de llamadas

| Generador | `max_tokens` | `tool_choice` | web_search | Multiplicador de output |
|---|---|---|---|---|
| `competency-pedagogical-generator.service.ts` (`draftCompetencyWeek`) | 4096 | `auto` | sí, `max_uses: 1` | 1 llamada = 1 semana |
| `project-ai.service.ts` (`draftProject`) | 8000 | `auto` | no | 1 llamada = TODO el proyecto (N semanas × M asignaturas) — **el mayor multiplicador** |
| `interdisciplinary-project-generator.service.ts` (`draftInterdisciplinaryProject`) | 8000 | `auto` | no | 1 llamada = TODO el proyecto (igual que arriba, 4 campos/semana en vez de 6) |
| `multigrade-week-generator.service.ts` (`ensureSharedExperience`) | 1024 | `auto` | no | 1 llamada por grupo multigrado (baja frecuencia) |
| `situation-narrative-generator.service.ts` (`generateSituationNarrative`) | 1024 | `auto` | no | 1 llamada por situación (solo título+descripción) |
| `planning-ai.service.ts` (`draftWeek`, modelo "destrezas", legado) | 2000 | forzado (`{type:'tool', name:'submit_week_draft'}`) | no | 1 llamada = 1 semana |

**`draftCompetencyWeek` es, con altísima probabilidad, el que generó el pico de 1.07M input tokens** — es el único con `web_search` habilitado, el único que se llama repetidamente por cada semana × grado (incluyendo el flujo multigrado, que dispara N llamadas a este mismo generador, una por grado del aula), y el que más volumen de llamadas tiene en logs de producción.

## Código completo: `draftCompetencyWeek` (el sospechoso principal)

Archivo: `apps/api/src/modules/ai-assistant/application/services/competency-pedagogical-generator.service.ts`

### Cómo se construye el bloque `system` (2 bloques separados, cache_control solo en el estático)

```ts
// Bloque ESTÁTICO — idéntico para CUALQUIER institución/docente/materia (rol,
// instrucciones de generación, y los catálogos DUA/evaluación, que son
// globales, no por institución).
const staticInstructions = `Eres un asistente pedagógico que ayuda a docentes ecuatorianos a redactar la planificación microcurricular semanal (PUD) por COMPETENCIAS, siguiendo el Currículo Nacional por Competencias (CNC) del MINEDUC.

Catálogo DUA disponible — cada actividad debe llevar EXACTAMENTE UN código de este catálogo, no inventes otros:
${duaCatalogText}

Catálogo de evaluación — technique debe ser uno de estos códigos EXACTOS, e instrument debe ser uno de sus instrumentos compatibles listados:
${techniquesText}

[... instrucciones de formato, ~40 líneas de texto ...]`

// Bloque VARIABLE — específico de esta materia/grado/competencia(s)/semana.
const contextPrompt = `Asignatura: ${situation.plan.courseAssignment.subject.name}
Grado/Curso: ${situation.plan.courseAssignment.parallel.level.name}
Trimestre: ${situation.academicPeriod.name}
${densityLine}
${sharedExperienceLine}

Competencias seleccionadas por el docente:

${competenciesBlock}

Identidad inmutable de esta generación (repítela EXACTA en identityCode, no la alteres): "${identityCode}"`
```

`competenciesBlock` es lo que más pesa del bloque variable — para CADA competencia seleccionada por el docente, incluye:
- Todos sus indicadores (código + texto completo)
- Los saberes de esa semana (id + tipo + código + descripción completa)

```ts
const competenciesBlock = competenciesForPrompt
  .map((c) => {
    const indicators = c.indicators.map((i) => `    - [${i.code}] ${i.text}`).join('\n') || '    (sin indicadores)'
    const sabersForWeek = selectedSaberIdSet
      ? c.sabers.filter((s) => selectedSaberIdSet.has(s.id))
      : selectSabersForWeek(c.sabers, currentWeekNumber, totalWeeksInBlock)
    const sabers = sabersForWeek.length
      ? sabersForWeek.map((s) => `      - [${s.id}] (${s.type}) ${s.code}: ${s.description}`).join('\n')
      : '      (sin saberes — propone nuevos)'
    return `- ${c.code}: ${c.text}\n  Indicadores:\n${indicators}\n  ${sabersNote}:\n${sabers}`
  })
  .join('\n\n')
```

**Si el docente selecciona MUCHAS competencias a la vez** (o competencias con muchos indicadores/saberes), este bloque puede crecer bastante — y es 100% variable, va DESPUÉS del breakpoint de cache, así que nunca cachea entre llamadas.

### La llamada real (con reintentos + pausa/resume de web_search)

```ts
const tools: Anthropic.Tool[] = [
  { name: 'submit_competency_week_draft', description: 'Envía el borrador estructurado', input_schema: RESPONSE_SCHEMA },
]
// web_search es server-side (Anthropic lo ejecuta, no nosotros) — con tool_choice
// forzado al tool de respuesta, Claude NUNCA podría buscar en el mismo turno, así
// que se pasa a "auto" + se instruye en el prompt que siempre debe terminar
// llamando submit_competency_week_draft.
const serverTools = [{ type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 1, allowed_callers: ['direct' as const] }]
const MAX_PAUSE_RESUMES = 2  // antes 5

const messages: Anthropic.MessageParam[] = [
  { role: 'user', content: `${contextPrompt}\n\nGenera el borrador de esta semana.` },
]
const systemBlocks: Anthropic.TextBlockParam[] = [
  { type: 'text', text: staticInstructions, cache_control: { type: 'ephemeral' } },
]

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {  // MAX_ATTEMPTS = 2
  for (let resumes = 0; resumes <= MAX_PAUSE_RESUMES; resumes++) {
    response = await client.messages.create({
      model: aiConfig.model,      // 'claude-sonnet-4-6'
      max_tokens: 4096,
      system: systemBlocks,
      messages,
      tools: [...tools, ...serverTools],
      tool_choice: { type: 'auto' },
    })
    if (response.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: response.content })  // reintenta con TODO el historial acumulado
  }
  // ... valida el tool_use devuelto, si falla agrega mensaje de corrección y reintenta ...
}
```

**Puntos clave para el diagnóstico de "1.07M input tokens en horas":**

1. **Cada `resume` de `pause_turn` reenvía TODO el `messages` acumulado** (incluyendo el bloque `system` variable, que no cachea). Si `web_search` pausa el turno 2 veces (el máximo permitido), son 3 llamadas completas dentro de un solo "intento" — y hay hasta 2 intentos (`MAX_ATTEMPTS`), así que el peor caso teórico es **6 llamadas completas por una sola semana generada**.
2. **El multigrado multiplica esto por N grados**: `multigrade-week-generator.service.ts` llama a `draftCompetencyWeek` una vez por cada grado del aula multigrado, cada una con su propio ciclo de reintentos/resumes independiente.
3. Si un docente/institución generó muchas semanas seguidas en poco tiempo (ej. planificando el trimestre completo, 8 semanas × varias materias), cada una dispara este ciclo completo.

## Ejemplo real de payload generado (output esperado, `RESPONSE_SCHEMA`)

```ts
const ACTIVITY_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', maxLength: 220 },   // agregado recientemente — antes sin techo
    duaCode: { type: 'string' },
  },
  required: ['text', 'duaCode'],
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    identityCode: { type: 'string' },
    newSabers: { type: 'array', items: SABER_SCHEMA },
    reusedSaberIds: { type: 'array', items: { type: 'string' } },
    methodology: {
      properties: {
        ANTICIPATION: { properties: { activities: { type: 'array', items: ACTIVITY_SCHEMA } } },  // 2-3 actividades
        CONSTRUCTION: { properties: { activities: { type: 'array', items: ACTIVITY_SCHEMA } } },   // 2-3 actividades
        CONSOLIDATION: { properties: { activities: { type: 'array', items: ACTIVITY_SCHEMA } } },  // 2-3 actividades
      },
    },
    resources: { type: 'array', items: { type: 'string', maxLength: 60 } },       // 3-6 items
    resourceLink: RESOURCE_LINK_SCHEMA,   // opcional, kind: web_search | generate_document
    assessment: {
      properties: {
        evidence: { type: 'string', maxLength: 220 },
        technique: { type: 'string' },
        instrument: { type: 'string' },
        instrumentLink: RESOURCE_LINK_SCHEMA,
      },
    },
  },
}
```

Ejemplo de respuesta real generada (anonimizado, semana de una sola materia):

```json
{
  "identityCode": "CE.3.1-w4-a1b2c3",
  "newSabers": [],
  "reusedSaberIds": ["saber-uuid-1", "saber-uuid-2"],
  "methodology": {
    "ANTICIPATION": {
      "activities": [
        { "text": "Los estudiantes observan un video corto sobre el ciclo del agua y anotan 3 preguntas.", "duaCode": "3.1" },
        { "text": "En parejas, comparten sus preguntas y las agrupan por tema en la pizarra.", "duaCode": "7.1" }
      ]
    },
    "CONSTRUCTION": {
      "activities": [
        { "text": "Cada grupo investiga una fase del ciclo del agua usando el material impreso entregado.", "duaCode": "2.5" },
        { "text": "Elaboran un esquema colaborativo de la fase asignada en cartulina.", "duaCode": "5.1" }
      ]
    },
    "CONSOLIDATION": {
      "activities": [
        { "text": "Cada grupo presenta su esquema al resto de la clase en 2 minutos.", "duaCode": "8.3" },
        { "text": "Responden individualmente una guía de 3 preguntas de cierre sobre el ciclo completo.", "duaCode": "9.1" }
      ]
    }
  },
  "resources": ["Video ciclo del agua", "Cartulina", "Guía de cierre"],
  "resourceLink": { "kind": "web_search", "searchQuery": "video ciclo del agua educativo primaria", "resolvedUrl": "https://...", "resolvedTitle": "..." },
  "assessment": {
    "evidence": "Esquema grupal del ciclo del agua con las 4 fases correctamente etiquetadas y presentado ante la clase.",
    "technique": "TEC.OBS",
    "instrument": "INS.LISTA_COTEJO"
  }
}
```

## Qué ya se hizo (para no repetir sugerencias)

- Tope diario + mensual de tokens por institución (`ai-budget.service.ts`), antes solo había mensual.
- `cache_control` separado en bloque estático vs variable en los 5 generadores (antes un solo bloque ephemeral mezclaba ambos, nunca lograba cache hit real).
- `max_uses: 1` en `web_search`, `MAX_PAUSE_RESUMES` bajado de 5 a 2.
- `maxLength` agregado a los campos de texto libre de los 3 generadores de mayor volumen (`competency-pedagogical`, `interdisciplinary-project`, `project-ai`).
- Logging de causa de reintento (`errors: string[]`) en `audit_logs` — antes solo se registraban tokens/modelo, sin saber por qué falló el primer intento.
- Badge visual de cupo diario restante en el frontend (Topbar) + modal educativo para el docente.

## Lo que se busca ahora

1. **Confirmar la causa exacta del pico de 1.07M input tokens** — ¿fue `web_search` pausando/resumiendo muchas veces? ¿fue un docente seleccionando muchísimas competencias/indicadores a la vez, inflando `competenciesBlock`? ¿fue simplemente MUCHAS llamadas normales en poco tiempo (varios docentes o el flujo multigrado)?
2. **Qué más cachear**: ¿el catálogo DUA/evaluación (`duaCatalogText`/`techniquesText`) ya cachea bien? ¿hay algo más que debería moverse al bloque estático?
3. **Qué mandar a un modelo más barato**: ¿alguna parte de este flujo (ej. la validación, o generar solo `resources`/`assessment`) podría resolverse con Haiku en vez de Sonnet?
4. **Si moverse a un modelo local tiene sentido** dado el volumen y la naturaleza del contenido (plantillas pedagógicas bastante estructuradas, no razonamiento abierto).
