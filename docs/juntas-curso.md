# Juntas de curso

## Uso

1. En **Juntas de curso**, selecciona año lectivo y período y pulsa **Crear convocatoria** en el grado/paralelo.
2. Completa fecha, hora, lugar, jornada, orden del día y convocados. **Publicar en Avisos** muestra una vista previa con destinatarios; **Publicar convocatoria** adjunta el PDF al aviso y guarda una copia en las evidencias. También puedes descargarla para entregar en físico.
3. Antes de la reunión, consulta el **Consolidado** y genera los informes opcionales para imprimir. El tutor prepara informes generales; cada docente, los de sus materias.
4. Durante la junta, en **Reunión y cierre**, registra asistencia real, desarrollo y acuerdos. **Cerrar junta y generar acta** guarda el acta y el consolidado revisado.
5. En **Informes y evidencias**, consulta los PDF o adjunta las copias firmadas.

Las pestañas siguen ese orden: convocatoria, consolidado, reunión/cierre e informes/evidencias. **Actualizar** recarga notas y documentos. El tutor es el responsable inicial; la autoridad puede designar a otra persona para dirigir. Solo la autoridad o la persona designada para dirigir puede cerrar o reabrir la junta.

La autoridad configura una **Secretaría** diferente para cada paralelo. Puede escoger a un docente de otro paralelo; por ejemplo, el secretario de A puede gestionar la convocatoria de B. Solo la persona asignada crea, descarga y publica la convocatoria. La autoridad configura y supervisa las juntas existentes, pero no reemplaza a secretaría en este flujo. Ser secretario no concede permiso para cerrar o reabrir la junta.

La publicación se realiza antes de la fecha y hora de reunión. El aviso llega únicamente a las cuentas activas del personal que figuran entre los convocados, nunca a familias/alumnos por pertenecer al curso. Los nombres sin cuenta única vinculada se muestran antes de publicar para entregarles el PDF. El tutor puede publicar y consultar el seguimiento de su convocatoria sin obtener permisos generales de publicación en Avisos.

Cada junta mantiene un solo aviso vinculado. Volver a publicar sin cambios no duplica el aviso ni reenvía notificaciones. Si se modifica la convocatoria, se revisa y actualiza explícitamente el mismo aviso, se conserva otra versión del PDF y se solicitan nuevas confirmaciones. Confirmar previamente en Avisos no registra asistencia real. El desarrollo, asistencia real y hora de cierre no alteran la convocatoria enviada.

## Convocatoria, asistencia y acta

En **Convocatoria** se completa una sola ficha: número, jornada, fechas, lugar, horario, responsable, orden del día y convocados. Teléfono y correo son opcionales. Los antecedentes precargan el texto del formato Word aportado (LOEI, art. 18, literal d); la institución puede cambiar ese texto y editarlo en cada convocatoria. El número es editable y se comparte entre los tres documentos; su valor inicial corresponde al número del período.

Los datos se guardan automáticamente al revisar la publicación en Avisos, descargar una convocatoria/asistencia o al cerrar la junta. **Guardar borrador** es opcional para continuar luego. Cambiar de pestaña conserva lo escrito. La asistencia, el desarrollo y la hora real de finalización están visibles en la sección de reunión.

Los docentes del paralelo se precargan sin marcar asistencia. Se pueden agregar invitados, editar funciones (incluida Secretaría) y registrar quién asistió. Solo tutor, autoridad o responsable designado pueden modificar esta ficha mientras la junta esté abierta.

- **Convocatoria PDF**: fecha de convocatoria/reunión, responsable, antecedentes, orden del día, lugar, horario previsto y convocados.
- **Asistencia PDF**: datos de reunión, orden del día, nombres y funciones; firmas en blanco para el papel.
- **Acta y consolidado PDF**: se genera al cerrar. Incluye desarrollo, asistencia registrada, acuerdos, hora real de finalización y firmas de los asistentes registrados. Si aún no se registró asistencia, lo indica y deja filas en blanco; no asume quórum ni aceptación.

El encabezado reutiliza el escudo configurado de la institución, grado/paralelo, jornada, número y año lectivo. El texto de cierre usa el mismo grado del encabezado. La hora prevista y la hora real de cierre son independientes; la fecha de emisión del sistema no sustituye los datos de la reunión.

Cada PDF emitido queda en las evidencias. Una corrección de la ficha no modifica las copias ya emitidas. No se pueden guardar cambios en una junta cerrada: primero debe reabrirla quien tenga permiso. Los documentos que no fueron emitidos antes del cierre no se generan retroactivamente mientras permanezca cerrada.

## Evidencias y entrega física

La carpeta es **año lectivo → período → grado/paralelo**. No se duplica en cada expediente individual.

- Cada consolidado, informe y acta emitidos se conserva como PDF independiente.
- En **Informes y evidencias**, **Ver / imprimir** abre la copia almacenada.
- **Adjuntar evidencia** admite el PDF, foto o escaneo del documento físico. Puede adjuntarse después de cerrar la junta.
- La indicación de firmas manuscritas la declara quien adjunta; no es firma electrónica ni confirmación de entrega física.
- Las versiones anteriores se conservan al reabrir una junta y emitir documentos nuevos.

Los archivos usan el servicio privado de almacenamiento existente (`storage`, local o S3 según la instalación). Su clave interna comienza con `course-boards/`; las descargas requieren autenticación, institución y acceso a la junta. La metadata, autor, fecha, hash y contenido utilizado para emitir el documento se guardan en `course_board_evidence`. La carpeta y su copia de cierre se guardan en `course_boards`. Los archivos locales de evidencias no se versionan en Git.

## Datos y permisos

El cálculo usa el motor canónico de notas y las recuperaciones pedagógicas del boletín. Respeta escala, valoración cualitativa, período y decimales configurados. Cero y ausencia de calificación se distinguen. Un asterisco indica que faltan componentes esperados de la nota.

El tutor y docentes asignados consultan sus cursos; usuarios con lectura de reportes de toda la institución consultan el conjunto. Un responsable delegado accede a la junta concreta para la que fue designado. Se requiere `reports:read`; para emitir informes y para que un docente adjunte evidencias se requiere además `formal_reports:write:own` o su equivalente de alcance institucional. Tutor, responsable y autoridad pueden adjuntar las copias de su junta.

El resumen muestra comportamiento/observaciones pedagógicas y, según configuración, asistencia, cantidad de incidencias y casos de refuerzo del período. No consulta ni incluye expedientes confidenciales de DECE ni descripciones de incidencias. La asistencia cuenta registros del modo configurado para el nivel: por materia o por jornada; no deben interpretarse automáticamente como días distintos.

Cerrar la junta no modifica notas ni cierra el período académico. Se guarda una copia de la información revisada. Una corrección posterior de notas no cambia los PDF ya emitidos ni la vista de la junta cerrada. La reapertura vuelve a mostrar datos actuales y conserva las evidencias previas. Si se agregan documentos o cambian las notas/el resumen mientras se revisa el cierre, se exige actualizar y revisar antes de cerrar.

## Configuración

Los PDF nuevos usan los azules del Word por defecto (`#D9E2F3` en encabezados/secciones y `#B4C6E7` en cabeceras de tablas), texto negro y el logo institucional como marca de agua al 5 % en todas las páginas. Se pueden cambiar los cuatro colores (encabezados, tablas, texto y bordes), desactivar la marca o ajustar su opacidad de 0 a 15 %. Sin logo se omite la marca de agua. Los PDF ya emitidos no se modifican.

En **Configuración → Juntas de curso**, la autoridad dispone de **Configurar juntas**: secretaría por paralelo, antecedentes predeterminados de la convocatoria, colores y marca de agua, además de nombre del documento, etiquetas de los tres campos, secciones del resumen y catálogo de informes (nombre, activo y autor: tutor/docente/ambos). Puede agregar tipos o desactivarlos; todos son opcionales. Los campos, tipos y asignaciones de secretaría se guardan en `Institution.settings.courseBoards`. Los límites y tipos de archivo se toman de la configuración de anexos existente, con un máximo de 10 MB por archivo.

## Instalación y validación

Aplicar `20261112180000_course_boards` , `20261116160000_course_board_meeting` y `20261116190000_course_board_invitation` mediante el procedimiento habitual de migraciones antes de habilitar el frontend. No requiere nuevas variables de producción: reutiliza el almacenamiento existente.

Las pruebas de integración solo admiten `COURSE_BOARDS_TEST_DATABASE_URL` apuntando a `127.0.0.1:55439/juntas_test`. Nunca usan `DATABASE_URL` como alternativa. Validan cálculo, permisos, archivos privados, publicación dirigida en Avisos, actualización sin duplicados, cierre, reapertura, concurrencia y recuperación ante errores al guardar.

Durante la validación desde una base vacía se detectó un fallo preexistente en `20260916120000_reinforcement_case_flow`: intenta modificar `learning_situations.interdisciplinary_subject_ids`, columna aún inexistente en ese punto de la cadena. No se modifica esa migración en este cambio. Para validar las tablas nuevas se preparó un esquema aislado a partir del modelo anterior al módulo y se aplicó allí únicamente la migración de juntas.
