# Búsqueda de estudiantes y carpeta compacta

Incidentes y Atención a Padres utilizan un selector compartido con búsqueda por nombre, apellido o documento y filtro por grado/paralelo. Cada resultado muestra documento y curso. La búsqueda ignora tildes, mayúsculas y orden de los términos; conserva identificadores alfanuméricos y ceros iniciales.

Se buscan coincidencias en todo el directorio autorizado. La pantalla presenta hasta 50 resultados y muestra el total para afinar el filtro, sin truncar los datos disponibles para búsqueda. En Atención a Padres se mantiene la opción Sin estudiante / general. Escape cierra primero la búsqueda, conservando el formulario. El componente admite navegación de resultados con flechas, Inicio/Fin y selección con Enter.

Los endpoints existentes de estudiantes mantienen nombre/documento y agregan sus cursos. Una consulta común exige institución, usuario activo y rol de estudiante; para docentes limita matrículas activas a cursos donde tienen una asignación activa o tutoría. El filtro también se aplica a los datos de curso devueltos, evitando mostrar cursos ajenos. El personal privilegiado conserva su directorio institucional. No requiere permisos de otro módulo ni migración.

Carpeta del Estudiante reemplaza tarjetas por una lista adaptable con nombre, documento, grado/paralelo y accesos directos a carpeta, notas, incidentes y atenciones. El menú de más secciones abre matrículas/certificados, actas, refuerzos y bitácora. Los enlaces consultan las secciones existentes y no crean registros. Los filtros y página se conservan al volver desde la carpeta. La búsqueda del servidor combina términos de nombres y apellidos con el alcance del docente; la paginación continúa en servidor.

Validación realizada:
- 19 pruebas de búsqueda, permisos del directorio, filtros de carpeta y regresión de incidentes.
- Tipos de API y web y compilación Vite.
- Chrome local con 80 estudiantes ficticios y todas las solicitudes de API interceptadas: vistas de escritorio/móvil, estudiante fuera de los primeros 50, búsqueda sin tildes y términos en distinto orden, documento extranjero seleccionado, accesos a secciones y retorno con filtros, opción de atención general y Escape sin cerrar el formulario. Sin errores de ejecución del navegador.

Desplegar API y web para disponer de los cursos en los nuevos selectores. No se crearon incidentes ni atenciones en producción durante la validación.
