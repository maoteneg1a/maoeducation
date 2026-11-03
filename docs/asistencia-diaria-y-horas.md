# Asistencia diaria y registro por hora

En niveles configurados con asistencia diaria, el tutor mantiene una única jornada por estudiante, paralelo y fecha. Los docentes de materias consultan esa jornada y registran lo observado en cada hora en **Mis clases**.

1. Abrir Asistencia del día para consultar o, si corresponde, registrar la jornada.
2. Abrir Mis clases y escoger una materia propia, la fecha y el número de hora de la jornada.
3. Consultar la referencia del tutor junto a cada estudiante. “Sin registrar” significa que todavía no existe un registro; no equivale a presente.
4. Marcar los estados y guardar. “Todos presentes” requiere una acción explícita. Cada hora impartida se registra por separado.
5. Consultar o corregir una hora desde el historial de la materia o seleccionando su fecha y hora. Repetir el guardado actualiza ese registro.

Una ausencia en una hora no modifica la jornada ni se suma otra vez como falta diaria. Si la jornada requiere una corrección, la hace el tutor o el personal autorizado en Asistencia del día. Los registros por hora no generan una segunda notificación de falta diaria a la familia. Los niveles con asistencia por materia conservan su flujo anterior.

Los permisos se comprueban en servidor: docente propietario para escribir sus horas; tutor para escribir la jornada; personal privilegiado según la política existente. Docentes ajenos no pueden consultar ni modificar estas asignaciones. Las correcciones de jornada y de horas guardan actor y valores anteriores/nuevos en auditoría.

El historial muestra las últimas 100 combinaciones de fecha y hora de cada asignación, con cantidad de estudiantes registrados. Fechas anteriores también se pueden consultar directamente con los selectores. La numeración de horas (1–20) identifica períodos lectivos, sin asumir duración en minutos ni generar horarios que la institución no haya definido.

## Despliegue y validación

Se requiere la migración `20261107000000_class_attendance_hours` antes de iniciar la nueva API. El arranque de producción ya ejecuta `prisma migrate deploy`. La migración agrega una tabla; no transforma ni borra la asistencia existente.

- Pruebas de rutas: `pnpm --filter api exec vitest run src/modules/attendance/presentation/class-attendance.routes.test.ts src/modules/academic/presentation/academic-scope.routes.test.ts`.
- Tipos: `pnpm --filter api lint` y `pnpm --filter web lint`.
- Integración con PostgreSQL local, antes de aplicar la nueva migración: `node apps/api/scripts/check-class-attendance.cjs`. Crea tabla y datos dentro de una transacción que se revierte; rechaza conexiones remotas y bases donde la tabla ya exista. Comprueba dos horas distintas, corrección sin duplicación, jornada intacta, cómputo de faltas diarias y auditoría.
