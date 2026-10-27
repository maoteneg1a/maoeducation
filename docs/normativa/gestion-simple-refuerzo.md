# Gestión sencilla del refuerzo

El criterio de producto es reducir clics y transcripción. Las sugerencias describen propuestas de trabajo que el docente confirma; no son una evaluación automática del estudiante ni un catálogo obligatorio del acuerdo.

- **Notas:** el campo de mejora por actividad se identifica como «Mejora individual». Conserva su cálculo y no consume intentos de un plan.
- **Alertas:** iniciar un plan requiere elegir el aprendizaje o actividad y una estrategia. El objetivo se propone a partir del aprendizaje y puede personalizarse. El contexto y los participantes proceden de la alerta. Al confirmar se abre la primera actividad.
- **Ficha:** cuatro apartados: Plan, Actividades y asistencia, Resultados y Documentos. La cabecera identifica el siguiente paso y los pendientes. Los enlaces antiguos de pestañas se resuelven en los nuevos apartados.
- **Plan:** las estrategias, recursos, evaluación y frecuencia tienen opciones sugeridas y texto personalizado. Los datos existentes se conservan.
- **Actividades:** la fecha corresponde al día de Ecuador; se elige el tipo de actividad y se puede personalizar. Crear una actividad no registra automáticamente su asistencia o nota.
- **Registro de notas:** estudiantes en filas y actividades en columnas, con pegado desde Excel, navegación con Enter y asistencia por celda. Guardar notas confirma el cálculo automático según la modalidad institucional (promedio formativo del período o actividades originales vinculadas). No se requiere vista previa, motivo ni una segunda acción de aplicar. Las correcciones y eliminaciones recalculan desde la base original y conservan historial; las mejoras individuales siguen siendo independientes. Vacío no cuenta y cero sí.
- **Resultados:** consulta del historial y valoración pedagógica. Cerrar seguimiento no modifica notas ni resuelve automáticamente alertas. La valoración guardada permanece visible.
- **Documentos:** el formulario del anexo reutiliza el docente de la asignatura, objetivo, agrupación y, cuando existe, la primera fecha registrada en las actividades. La matriz de Lengua y Literatura o Matemática recibe solo los datos de su propia asignatura. No se inventan horarios, duración, indicadores ni logros. Las ediciones explícitas del docente tienen prioridad.
- **Buzón:** acuses y solicitudes de cambios siguen siendo decisiones del destinatario. Las observaciones frecuentes pueden elegirse y editarse.
- **Bitácora anual:** se propone el único caso del período cuando no hay ambigüedad. Se conserva la separación respecto a las alertas tempranas y la confirmación de firmas de los respaldos subidos.

Validación del recorrido sin modificar calificaciones: `pnpm --filter api exec tsx ../../scripts/check-reinforcement-flow.ts`. Las pruebas del servidor cubren reutilización de datos, preservación de correcciones y separación de las matrices por asignatura. La revisión con usuarios reales sigue siendo necesaria para medir tiempo y facilidad de uso.

El registro automático guarda notas, cálculo e historial en una transacción, bloquea períodos y casos cerrados y detecta sobrescrituras concurrentes por celda. Considera las actividades calificadas de los planes de la misma asignatura y período, normalizando sus escalas. Las prácticas sin nota y las ausencias no entran al promedio; las mejoras individuales y sumativas ya aplicadas no se vuelven a contar. Corregir o borrar la última nota restaura el cálculo que corresponda, conservando las versiones anteriores. La modalidad por actividades exige un vínculo por columna y una nota original del estudiante.
