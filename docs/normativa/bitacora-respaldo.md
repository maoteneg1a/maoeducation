# Bitácora de respaldo ante riesgo de reprobar

Implementa la lista de trece documentos de la fotografía y presentación aportadas por el usuario. Se encuentra en **Carpeta del estudiante → Bitácora de respaldo**. El docente selecciona el año y la asignatura en seguimiento; la elegibilidad y el checklist no consultan ni requieren alertas tempranas.

## Documentos

La lista completa está en `apps/api/src/shared/domain/dossier-checklist.ts` y es configurable por institución. Incluye los trece puntos, en su orden original. El punto 7 exige tres informes al tutor. El punto 6 exige una carta firmada; el punto 11, un acta de reunión firmada. Adaptaciones curriculares e informe técnico DECE permiten justificar explícitamente que no aplican. La ausencia de evidencias no marca automáticamente un requisito condicional como «No aplica».

Cada punto admite:

- Documentos de Auleka, asociados automáticamente por tipo, estudiante, año y materia. Se muestran los borradores propios y documentos enviados; solo los informes recibidos o atendidos satisfacen requisitos sin firma manuscrita.
- Generar un nuevo documento desde el checklist, con el estudiante y contexto seleccionado. Para plan, avances y asistencia se elige un caso de refuerzo. Los anexos 2–5 mantienen su exportación fiel al Word original. Las reuniones se registran desde el módulo existente de atenciones/reuniones.
- Subir PDF o escaneados JPG, PNG o WEBP. Se guarda punto del checklist, año, estudiante, materia cuando corresponde, responsable, fecha, observación, confirmación de firmas y hash del archivo. Subir el mismo archivo al mismo punto y contexto no cuenta dos veces.
- En requisitos condicionales, registrar «No aplica» con motivo o volver a exigir el documento.

Las actas generales del estudiante se comparten entre sus materias. Los requisitos por asignatura y sus archivos se evalúan exclusivamente para la materia seleccionada. Un documento de otra materia no completa el punto. Una carta generada sin respaldo firmado, un acta sin firma, un caso de refuerzo existente o una adaptación marcada en matrícula no sustituyen los documentos que debe conservar el docente.

## Separación respecto a alertas tempranas

El **Anexo 1 (`acta_entrega_alertas`)** es el acta grupal de alertas enviada a Subdirección/autoridades. El **informe al tutor (`bajo_rendimiento_tutor`)** es individual y pertenece al punto 7 del checklist. Se mantienen separados, incluso si una configuración anterior había asociado equivocadamente el Anexo 1 con esa clave. Un Anexo 1 histórico con esa asociación incorrecta tampoco se contabiliza como informe al tutor.

El progreso del expediente mide documentos completos, incompletos, pendientes y no aplicables. No es una alerta académica ni una decisión de promoción.

## Acceso y persistencia

Solo personal con acceso al estudiante puede abrir la bitácora. El docente consulta sus asignaturas; el tutor y quienes tienen permiso transversal pueden consultar las correspondientes al estudiante. Los archivos siguen los roles de carga y límites de tamaño de la configuración institucional. Representantes y estudiantes no suben archivos ni acceden a esta bitácora. Los informes DECE confidenciales conservan sus restricciones; los archivos reservados solo son descargables por quien los subió, DECE o la autoridad. Solo el autor del archivo o la autoridad pueden retirarlo.

La migración `20261101000000_dossier_checklist_files` agrega `dossier_files` y `dossier_exceptions`, con claves foráneas, índices por institución/estudiante/año y unicidad para evitar respaldos duplicados. Los archivos utilizan el almacenamiento local o S3 existente. No se modifica ninguna calificación ni se activa una alerta al cargar un respaldo.

En **Evaluación normativa → Expediente y adjuntos**, el botón **Cargar checklist de los 13 documentos** prepara los requisitos originales en el formulario; guardar aplica la configuración. Las firmas y el carácter condicional se pueden ajustar por institución.
