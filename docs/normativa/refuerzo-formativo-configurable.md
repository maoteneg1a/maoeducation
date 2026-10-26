# Refuerzo formativo configurable

La institución elige el procedimiento en **Configuración de calificación → Refuerzo del aprendizaje formativo**, conforme a su MIEE. Las dos modalidades implementadas son decisiones institucionales de cálculo; no se presentan como fórmulas literales del acuerdo.

- **Por aprendizajes: conjunto de actividades** (`activity_set`): el docente selecciona actividades formativas publicadas y calificadas del mismo estudiante, asignatura y período.
- **Integral del período: promedio formativo** (`period_formative`): se aplica el resultado del plan a la base formativa completa.

Se configuran el peso del refuerzo (mayor que 0 y menor que 100 %) y el tope del resultado recuperado. Valores iniciales: 50 % y 7/10, o su equivalente en la escala institucional. La modalidad empieza sin configurar para que la institución elija explícitamente. Guardar otra modalidad no cambia las aplicaciones históricas: cada una conserva su procedimiento, escala, ponderación y tope.

## Cálculo

Se conserva el motor existente: promedio de actividades formativas por insumo y promedio simple de los insumos con calificación. Las sumativas mantienen sus notas y ponderaciones.

Sea `w` el peso del refuerzo expresado entre 0 y 1, `R` el promedio simple de las evidencias calificadas seleccionadas del plan y `C` el tope:

```text
resultado recuperado = max(inicial, min(C, inicial × (1 − w) + R × w))
```

El cálculo conserva la nota inicial si el resultado no representa una mejora.

En la modalidad integral, `inicial` es la base formativa. Por ejemplo, base 5, refuerzo 8 y peso 50 % producen 6,50; esta base se pondera posteriormente con la sumativa.

En la modalidad por conjunto, cada actividad mantiene su participación en la formativa: `1 / número de insumos calificados / número de actividades calificadas de su insumo`. El promedio del conjunto utiliza esas participaciones normalizadas. Se reemplaza únicamente su contribución agregada:

```text
formativa ajustada = formativa inicial
                  + participación del conjunto × (conjunto recuperado − conjunto inicial)
```

Las notas individuales originales se conservan. Los promedios por insumo permanecen como antecedentes, y el resumen distingue la formativa inicial de la que incluye refuerzo. Se bloquea la aplicación por conjunto cuando hay promedios manuales por insumo, porque no se puede atribuir el peso a las actividades de forma fiable. La modalidad integral sí admite esos promedios.

## Operación docente

1. Registrar las sesiones/actividades del plan con fecha y asistencia. Las prácticas pueden quedar sin nota. Al estar configurada una modalidad, las calificaciones formativas se registran como evidencia, sin alterar automáticamente una actividad original.
2. Abrir **Caso de refuerzo → Resultado formativo** y seleccionar al estudiante.
3. Seleccionar las actividades originales cuando corresponda y las actividades calificadas del refuerzo. Solo participan evidencias con asistencia, nota y sin aplicación previa a una nota individual. Las evidencias sumativas continúan con su procedimiento individual.
4. Revisar la vista previa de la base formativa y del total del período. Se exige una nueva revisión si cambian los datos o la configuración.
5. Registrar un motivo y aplicar. El historial conserva autor, fecha, motivo, evidencias, actividades originales, configuración y resultados antes/después.

Solo puede existir una aplicación vigente por estudiante, asignatura y período, incluso si existen varios planes. Una nueva aplicación **sustituye** a la anterior; no se acumula sobre el resultado recuperado anterior. Para incluir más evidencias del plan se selecciona nuevamente el conjunto que debe participar. El docente puede retirar la aplicación mediante una nueva versión que conserva el historial.

Los cambios posteriores en sesiones no modifican silenciosamente el resultado aplicado: este conserva sus evidencias. Si se requiere otro resultado, se revisa y aplica una nueva versión. El cálculo de la base original utiliza las calificaciones vigentes del período. Las escalas de las evidencias y aplicaciones se conservan para normalizar correctamente si cambia la escala institucional.

Se verifica permiso de escritura de notas, asignación del docente, participación en el plan, matrícula activa, institución y período abierto. Se bloquea la coexistencia con una recuperación pedagógica aplicada al total del mismo período para evitar el doble cómputo.

## Integración y despliegue

El resumen docente, las notas del estudiante, el boletín, la promoción, la mesa de refuerzo y los consumidores del motor de alertas/informes utilizan `computePeriodGrades`. La aplicación de refuerzo no crea tareas ordinarias ni añade una segunda contribución al promedio.

La bitácora de respaldo y sus documentos siguen siendo un proceso distinto de las alertas tempranas. No se modifica la estructura de los anexos originales.

Migración necesaria: `20261102000000_formative_reinforcement_results`. Crea un historial de aplicaciones y agrega la escala de las notas de las sesiones. Aplicar las migraciones antes de iniciar la versión nueva de la API. Esta implementación se validó en una base aislada; no aplica migraciones ni publica cambios automáticamente en otros entornos.
