# Actas de compromiso y seguimiento

La muestra `acta-compromiso-ejemplo.pdf` usa exclusivamente datos ficticios. La fecha corresponde a su generación; no se creó ningún expediente ni acta en producción.

## Crear un acta

En **Incidentes → detalle del caso → Actas de compromiso** se pueden registrar fecha, lugar y objetivo de la reunión; participantes; acuerdos con responsable, plazo y verificación; observaciones y fecha de seguimiento. Se exige al menos un acuerdo detallado completo o un compromiso general.

El PDF incorpora identificación del estudiante y representantes registrados, curso/año del incidente cuando existe una matrícula para esas fechas, relato del incidente, responsable del registro, DECE asignado y estado. La bitácora permite seleccionar actuaciones. La relación de evidencias muestra nombre, fecha y autor del archivo; no incorpora los archivos originales.

Los representantes registrados en el expediente no se consideran participantes automáticamente. Al registrar participantes, los espacios de firma llevan sus nombres y roles. En caso contrario se utilizan las firmas de la plantilla. Crear el PDF no significa que se hayan recogido firmas.

## Personalizar por institución

En **Configuración → Personalización → Actas de compromiso**, el administrador puede guardar título, subtítulo, apertura, cierre, color de títulos, firmas predeterminadas, marca de agua e inclusión predeterminada de bitácora y evidencias. **Descargar vista previa** usa datos ficticios y los cambios del formulario sin guardarlos.

Las nuevas actas guardan una copia de los textos de la plantilla, los acuerdos y los datos del expediente incluidos al emitirlas. Los cambios posteriores del caso o de la plantilla no reescriben esa copia. El logotipo se resuelve desde la referencia guardada; su disponibilidad sigue dependiendo del archivo de identidad institucional.

Las actas anteriores, sin copia conservada, siguen usando sus compromisos originales y consultan el contexto actual del expediente. El PDF identifica expresamente la fecha de consulta; no presenta esos datos como un registro histórico de la emisión.

## Despliegue y comprobación

Se requiere la migración `20261024000000_incident_commitment_document`, que añade la columna nullable `incident_commitments.document_data`. El arranque de producción existente ejecuta `prisma migrate deploy` antes de iniciar la API. Esta revisión no aplica migraciones ni modifica datos de producción.

Comprobaciones: generación de Prisma Client, TypeScript en API y web, compilación web, pruebas de documentos, validación de acuerdos/fechas, aislamiento por institución, preservación de configuración, compatibilidad de actas antiguas y paginación con textos largos/veinte participantes. La muestra de dos páginas se revisó visualmente.
