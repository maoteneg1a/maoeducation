# Cambio de paralelo o jornada

En **Matrículas**:

1. Selecciona el año lectivo y el paralelo de origen.
2. Pulsa **Cambiar paralelo/jornada**.
3. Selecciona el paralelo de destino y marca uno o varios estudiantes. Puedes buscar por apellidos, nombres o cédula y seleccionar todos los resultados de la búsqueda.
4. Escribe un motivo si corresponde y pulsa **Confirmar cambio**.

Solo aparecen destinos activos del mismo grado, año lectivo y oferta educativa. Para cambiar de jornada, selecciona el paralelo correspondiente a la nueva jornada. El usuario debe tener permiso de gestión de matrículas y acceso a ambos paralelos.

Se admiten hasta 500 estudiantes por operación. Todos deben tener matrícula activa en el origen y el destino debe tener cupos suficientes cuando se ha configurado su capacidad. Si alguna validación falla, no se mueve ningún estudiante.

La matrícula conserva su identificador, fecha, estado activo y adaptaciones NEE; solo cambia el paralelo. Las notas, asistencias e informes previos conservan su vínculo con el curso original y no se copian ni se convierten en notas del curso de destino. Esta acción no realiza una promoción de grado ni una matrícula para otro año.

Cada cambio queda registrado en auditoría como **Cambio de paralelo/jornada**, con el usuario, fecha, origen, destino y motivo. El registro se guarda en la misma transacción que el cambio de matrícula.
