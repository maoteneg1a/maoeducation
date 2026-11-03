# Mensajes por curso y selectores de paralelos

En Mensajes, un profesor puede escoger **grado y paralelo**, sin repetir el curso por cada materia que imparte. El directorio del docente reúne estudiantes y representantes de sus cursos activos y tutorías del año activo; ya no se trunca a 30 personas.

1. Abrir Nuevo mensaje y escoger un grado/paralelo o Todos mis cursos.
2. Filtrar por estudiantes, representantes o todos. La búsqueda por nombre se combina con el curso elegido.
3. Marcar personas o Seleccionar todo el curso. Si hay texto de búsqueda, la acción se llama Seleccionar resultados.
4. Cambiar de curso para agregar más destinatarios. La selección se conserva, cada persona aparece una sola vez y el total permanece visible. Limpiar selección permite comenzar de nuevo.
5. Revisar el total antes de enviar. La autorización de los destinatarios se comprueba otra vez al enviar.

Los cursos se consultan en `/messages/recipient-groups` y los destinatarios en `/messages/recipients?parallelId=...&audience=students|guardians|all&q=...`. Las consultas exigen institución, matrícula activa y coincidencia exacta de paralelo/año. Un profesor no puede abrir un curso ajeno cambiando el ID. Compartir varias materias o tener hermanos con el mismo representante no duplica al destinatario.

## Revisión de selectores

- **Matrículas:** incorpora la corrección del PR #174: usa los paralelos autorizados por servidor; elimina la consulta de matrículas del alumno que ocultaba cursos al docente.
- **Horario:** empieza en el año activo, muestra Todos mis paralelos y cantidad disponible, distingue error de consulta de falta de asignaciones, y explica cuando no hay bloques horarios registrados. Tener materias asignadas no crea automáticamente un horario.
- **Proyectos interdisciplinarios:** usa los paralelos autorizados por servidor, sin ocultar asignaciones cuando el docente también es tutor de otro curso.
- **Comportamiento y Promoción:** conservan el filtro de tutorías existente. Consultan `tutorId` actual de los paralelos, sin depender de los IDs guardados en una sesión anterior; explican la ausencia de tutorías y los errores de consulta. Los roles privilegiados mantienen el acceso previsto.
- **Calificaciones:** la consulta `my-course-assignments` se utiliza solo para estudiantes/representantes; los docentes usan sus asignaciones. No presenta el filtro erróneo identificado en Matrículas.

Comprobación en producción de la cuenta de Torres Huanga: el servidor devuelve 10 paralelos, 11 asignaciones y el directorio antiguo se limita a 30 destinatarios. Se realizaron consultas; no se enviaron mensajes de prueba ni se cambiaron asignaciones.

Este cambio no requiere migración. API y web deben desplegarse juntas para disponer del nuevo selector de Mensajes.
