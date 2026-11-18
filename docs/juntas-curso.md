# Juntas de curso

## Responsabilidades y flujo

| Persona | Qué hace |
| --- | --- |
| Docente de asignatura | Guarda sus notas en **Calificar** y recibe la convocatoria en **Avisos**. No entra a la junta ni descarga sus documentos por ser docente del curso. |
| Tutor del curso | Revisa todas las materias y pulsa **Confirmar notas**. Ve una sola pantalla de consolidado, sin convocatoria, acta, cierre ni adjuntos. Su informe es opcional. |
| Secretaría asignada | Crea/publica la convocatoria y prepara asistencia, desarrollo, acuerdos y acta. Adjunta las copias físicas. |
| Autoridad (administración, rectoría e inspección) | Consulta el consolidado completo, observaciones y documentos. Administración/rectoría pueden reabrir una junta para corregirla. |

1. La autoridad asigna **Secretaría** por paralelo en **Configuración → Juntas de curso**.
2. Secretaría selecciona período y curso, completa la convocatoria y la publica en **Avisos**, con su PDF adjunto.
3. Los docentes completan sus notas en **Calificar**. El tutor revisa el consolidado y pulsa **Confirmar notas**.
4. Durante la reunión, secretaría registra asistencia real, desarrollo y acuerdos. **Cerrar junta y generar acta** requiere la confirmación del tutor y guarda acta y consolidado juntos.
5. Secretaría adjunta las copias firmadas en **Documentos**. La autoridad supervisa el conjunto.

Ser docente de una materia, tener permiso general de informes o figurar en “Dirige” no concede acceso a la carpeta. Cada tutor/secretario accede únicamente a los cursos donde tenga esa responsabilidad. El menú se oculta a los demás docentes; la API aplica la misma restricción, incluso para los PDF y adjuntos.

Secretaría tiene tres pestañas: **Convocatoria**, **Acta** y **Documentos**. La autoridad ve **Consolidado**, **Acta** y **Documentos**. Si una persona reúne responsabilidades se combinan las acciones correspondientes.

La confirmación archiva una copia del consolidado con autor, fecha y huella de las notas en las evidencias existentes (`GRADES_CONFIRMATION`), sin nuevas tablas ni migraciones. Si cambian alumnos, materias o notas, el tutor debe revisar y confirmar nuevamente; los cambios de asistencia o desarrollo no reemplazan esa confirmación. Reabrir una junta conserva los PDF y archiva la confirmación anterior, solicitando una nueva revisión.

La publicación se realiza antes de la fecha y hora de reunión. El aviso llega solo al personal convocado, nunca a familias/alumnos por pertenecer al curso. Los invitados sin cuenta vinculada se muestran para entregarles el PDF. Secretaría puede publicar y ver el seguimiento de su convocatoria sin permisos generales de publicación en Avisos.

Cada junta mantiene un solo aviso. Volver a publicar sin cambios no duplica ni reenvía. Actualizar explícitamente la convocatoria conserva los PDF anteriores y solicita nuevas confirmaciones de invitación. Estas confirmaciones de Avisos son independientes tanto de la asistencia real como de la confirmación de notas del tutor.

## Consolidado horizontal

Todas las materias van juntas, sin bloques de ocho ni títulos “1/2, 2/2”. Los cursos de hasta 27 alumnos y 11 materias usan A4 horizontal; los más grandes usan A3 horizontal para conservar legibilidad. Se compactan las filas y se ajusta la letra al ancho de columnas. Si la lista todavía requiere varias páginas, se pagina solo por alumnos, repitiendo todas las materias y el encabezado. El resultado siempre es un único archivo PDF.

## Convocatoria, asistencia y acta

En **Convocatoria** se completa una sola ficha: número, jornada, fechas, lugar, horario, responsable, orden del día y convocados. Teléfono y correo son opcionales. Los antecedentes precargan el texto del formato Word aportado (LOEI, art. 18, literal d); la institución puede cambiar ese texto y editarlo en cada convocatoria. El número es editable y se comparte entre los tres documentos; su valor inicial corresponde al número del período.

Los datos se guardan automáticamente al revisar la publicación en Avisos, descargar una convocatoria/asistencia o al cerrar la junta. **Guardar borrador** es opcional para continuar luego. Cambiar de pestaña conserva lo escrito. La asistencia, el desarrollo y la hora real de finalización están visibles en la sección de reunión.

Los docentes del paralelo se precargan sin marcar asistencia. Se pueden agregar invitados, editar funciones (incluida Secretaría) y registrar quién asistió. Solo la secretaría asignada puede modificar esta ficha mientras la junta esté abierta.

- **Convocatoria PDF**: fecha de convocatoria/reunión, responsable, antecedentes, orden del día, lugar, horario previsto y convocados.
- **Asistencia PDF**: datos de reunión, orden del día, nombres y funciones; firmas en blanco para el papel.
- **Acta y consolidado PDF**: se genera al cerrar. Incluye desarrollo, asistencia registrada, acuerdos, hora real de finalización y firmas de los asistentes registrados. Si aún no se registró asistencia, lo indica y deja filas en blanco; no asume quórum ni aceptación.

El encabezado reutiliza el escudo configurado de la institución, grado/paralelo, jornada, número y año lectivo. El texto de cierre usa el mismo grado del encabezado. La hora prevista y la hora real de cierre son independientes; la fecha de emisión del sistema no sustituye los datos de la reunión.

Cada PDF emitido queda en las evidencias. Una corrección de la ficha no modifica las copias ya emitidas. No se pueden guardar cambios en una junta cerrada: primero debe reabrirla quien tenga permiso. Los documentos que no fueron emitidos antes del cierre no se generan retroactivamente mientras permanezca cerrada.

## Evidencias y entrega física

La carpeta es **año lectivo → período → grado/paralelo**. No se duplica en cada expediente individual.

- Cada consolidado, informe y acta emitidos se conserva como PDF independiente.
- En **Documentos**, **Ver / imprimir** abre la copia almacenada.
- **Adjuntar evidencia** admite el PDF, foto o escaneo del documento físico. Puede adjuntarse después de cerrar la junta.
- La indicación de firmas manuscritas la declara quien adjunta; no es firma electrónica ni confirmación de entrega física.
- Las versiones anteriores se conservan al reabrir una junta y emitir documentos nuevos.

Los archivos usan el servicio privado de almacenamiento existente (`storage`, local o S3 según la instalación). Su clave interna comienza con `course-boards/`; las descargas requieren autenticación, institución y acceso a la junta. La metadata, autor, fecha, hash y contenido utilizado para emitir el documento se guardan en `course_board_evidence`. La carpeta y su copia de cierre se guardan en `course_boards`. Los archivos locales de evidencias no se versionan en Git.

## Datos y permisos

El cálculo usa el motor canónico de notas y las recuperaciones pedagógicas del boletín. Respeta escala, valoración cualitativa, período y decimales configurados. Cero y ausencia de calificación se distinguen. Un asterisco indica que faltan componentes esperados de la nota.

La lectura y las acciones se limitan por responsabilidad, además del permiso básico `reports:read`. Solo el tutor puede confirmar las notas y emitir sus informes opcionales (con `formal_reports:write:own`). Solo secretaría crea/publica convocatorias, modifica datos de reunión, cierra el acta y adjunta evidencias. Las autoridades consultan el conjunto; no sustituyen la confirmación del tutor.

El resumen muestra comportamiento/observaciones pedagógicas y, según configuración, asistencia, cantidad de incidencias y casos de refuerzo del período. No consulta ni incluye expedientes confidenciales de DECE ni descripciones de incidencias. La asistencia cuenta registros del modo configurado para el nivel: por materia o por jornada; no deben interpretarse automáticamente como días distintos.

Cerrar la junta no modifica notas ni cierra el período académico. Se guarda una copia de la información revisada. Una corrección posterior de notas no cambia los PDF ya emitidos ni la vista de la junta cerrada. La reapertura vuelve a mostrar datos actuales y conserva las evidencias previas. Si se agregan documentos o cambian las notas/el resumen mientras se revisa el cierre, se exige actualizar y revisar antes de cerrar.

## Configuración

Los PDF nuevos usan los azules del Word por defecto (`#D9E2F3` en encabezados/secciones y `#B4C6E7` en cabeceras de tablas), texto negro y el logo institucional como marca de agua al 5 % en todas las páginas. Se pueden cambiar los cuatro colores (encabezados, tablas, texto y bordes), desactivar la marca o ajustar su opacidad de 0 a 15 %. Sin logo se omite la marca de agua. Los PDF ya emitidos no se modifican.

En **Configuración → Juntas de curso**, la autoridad dispone de **Configurar juntas**: secretaría por paralelo, antecedentes predeterminados de la convocatoria, colores y marca de agua, además de nombre del documento, etiquetas de los tres campos, secciones del resumen y catálogo de informes (nombre, activo y autor: tutor/docente/ambos). Puede agregar tipos o desactivarlos; todos son opcionales. Los campos, tipos y asignaciones de secretaría se guardan en `Institution.settings.courseBoards`. Los límites y tipos de archivo se toman de la configuración de anexos existente, con un máximo de 10 MB por archivo.

## Instalación y validación

Aplicar `20261112180000_course_boards` , `20261116160000_course_board_meeting` y `20261116190000_course_board_invitation` mediante el procedimiento habitual de migraciones antes de habilitar el frontend. No requiere nuevas variables de producción: reutiliza el almacenamiento existente.

Las pruebas de integración solo admiten `COURSE_BOARDS_TEST_DATABASE_URL` apuntando a `127.0.0.1:55439/juntas_test`. Nunca usan `DATABASE_URL` como alternativa. Validan cálculo, permisos por responsabilidad, bloqueo a docentes con permisos generales, archivos privados, confirmación del tutor, cambios de notas, publicación dirigida, cierre, reapertura, concurrencia y limpieza de archivos cuando falla el guardado.

Durante la validación desde una base vacía se detectó un fallo preexistente en `20260916120000_reinforcement_case_flow`: intenta modificar `learning_situations.interdisciplinary_subject_ids`, columna aún inexistente en ese punto de la cadena. No se modifica esa migración en este cambio. Para validar las tablas nuevas se preparó un esquema aislado a partir del modelo anterior al módulo y se aplicó allí únicamente la migración de juntas.
