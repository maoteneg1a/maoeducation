# Anexos fieles al documento original

La fuente es el archivo `ANEXOS RECUPERACION PEDAGÓGICA 2026 -2027.docx` aportado por el usuario, conservado sin modificaciones en `apps/api/assets/reinforcement-annexes/original.docx`. Su SHA-256 está en `manifest.json`.

Los cinco anexos se completan directamente en copias de sus párrafos y tablas de Word. Se preservan el diseño del membrete, las fuentes, márgenes, bordes, títulos, orden, firmas, referencias normativas y redacción original, incluidos «0031A» en el Anexo 2 y «parciales o quimestrales» en el Anexo 4. La identidad institucional y el año lectivo se parametrizan; el resto del contenido no se corrige ni resume automáticamente.

El membrete utiliza el nombre completo y el logo guardados en la configuración de la institución. Se reemplazan también las referencias a la escuela de origen en el cuerpo del documento. El año procede del año lectivo asociado al informe y la segunda línea conserva la etiqueta «SUBDIRECCIÓN». Si falta el año o el nombre, se dejan espacios para completar; si falta el logo o no puede procesarse, se omite el logo escolar, sin reutilizar el de Panamá. Se conserva el escudo nacional del formato original. El logo se convierte a PNG y se ajusta dentro de su caja original sin deformarse. Se admiten los formatos PNG, JPEG, WebP y SVG de la configuración, sin descargar recursos HTTP. No se sustituye por el encabezado genérico de Auleka. El estado del informe y el acuse permanecen en la aplicación; no se añaden bloques de metadatos, títulos «CONTENIDO», marcas de borrador ni firmas diferentes al impreso.

## Modelos y captura

1. **Anexo No.1 — ACTA DE ENTREGA Y RECEPCIÓN DE ALERTAS TEMPRANAS POR BAJO DESEMPEÑO ACADÉMICO.** Informe grupal dirigido a Subdirección/autoridades, con los párrafos íntegros del original y la nómina de varios alumnos. Conserva sus siete renglones vacíos y amplía la misma fila cuando se necesita incluir más estudiantes. Los espacios sin información permanecen como en el Word. No añade textos de constancia distintos al original.
2. **Anexo N° 2 — ACTA DE COMPROMISO PARA PADRES DE FAMILIA.** Conserva todos los párrafos y los nueve compromisos del original. Se completan representante, estudiante, grado, jornada, año y la tabla de asignaturas/días/horario. Permanecen las firmas de padre de familia, docente y subdirectora.
3. **Anexo N° 3 — PLANIFICACIÓN DE REFUERZO ACADÉMICO INDIVIDUAL.** Conserva identificación, casillas de modalidades y la matriz original de seis columnas con filas para Lengua y Literatura y Matemática. El docente completa los contenidos de cada fila. No se sustituye por un resumen del caso ni se convierte en un PIAE.
4. **Anexo N° 4 — INFORME INDIVIDUAL DE AVANCES DEL APRENDIZAJE DEL ESTUDIANTE.** Conserva las tablas de identificación, logros/dificultades/sugerencias y resultados antes/después; el párrafo íntegro del artículo 10.4; lugar/fecha y las dos firmas. La asistencia y los resultados se limitan al estudiante seleccionado.
5. **Anexo N° 5 — REGISTRO DE ASISTENCIA AL REFUERZO ACADÉMICO.** Conserva la nómina original con diez estudiantes, ocho columnas de fechas y la columna para firmas manuscritas. Más fechas o estudiantes producen hojas adicionales del mismo formato. Los datos de asistencia se colocan en la matriz; no se sustituye por una lista de sesiones.

Los espacios de firma se conservan para firma manuscrita. El acuse digital registra recepción y no sustituye la firma.

## Configuración

En **Evaluación normativa → Informes e instancias → Cargar los cinco anexos**, revisar el destino **Subdirección / responsable del refuerzo** y guardar. Inicialmente apunta al rol Rector; puede asignarse al rol de Subdirección o a personas concretas. Los campos del formulario corresponden a los espacios del original. Los anexos no utilizan el editor de títulos, pie ni firmas genéricos.

El Anexo 1 utiliza la clave `acta_entrega_alertas` y corresponde al flujo de alertas tempranas dirigido a Subdirección/autoridades. El informe al tutor conserva su propia clave `bajo_rendimiento_tutor`; es un documento individual y el punto 7 de la bitácora exige al menos tres. Son documentos distintos y el Anexo 1 no completa ese punto.

La lista anual de trece documentos ante riesgo de reprobar está implementada en la **Bitácora de respaldo**, dentro de la carpeta del estudiante. Permite generar los informes correspondientes o subir PDF y escaneados por punto del checklist. No requiere alertas tempranas. Ver `bitacora-respaldo.md`.


## Exportación y servidor

- **Word:** `GET /formal-reports/:id/docx`, con la misma autorización y confidencialidad que el PDF.
- **PDF:** `GET /formal-reports/:id/pdf`. Para anexos, se convierte el mismo DOCX con LibreOffice Writer en modo headless. No se mantiene una segunda maqueta aproximada en PDFKit. Los informes generales conservan su generación anterior.
- Instalar LibreOffice Writer y las fuentes del documento en el servidor. El ejecutable por defecto es `libreoffice`; puede indicarse una ruta absoluta con `LIBREOFFICE_BIN`. Cada conversión utiliza un directorio y perfil temporales independientes y los limpia al terminar. Si el conversor no está disponible, devuelve un error 503 explícito y mantiene disponible Word.
- Railway: la raíz del servicio API es `apps/api`. `nixpacks.toml` instala `libreoffice-writer`, Fontconfig, Carlito (compatible métricamente con Calibri) y Liberation; `railpack.json` incluye los mismos paquetes tanto en construcción como en la imagen final. No hace falta cambiar de constructor. Ambos ejecutan `pnpm check:annex-pdf`, que convierte la plantilla original del Anexo 1 en un directorio temporal y comprueba el PDF antes de completar la construcción. Tras incorporar estos archivos hay que reconstruir y desplegar la API; reiniciar una imagen antigua no instala paquetes. Si Railway tiene comandos o listas de paquetes personalizados en Settings/Variables, deben conservar esta comprobación y estos paquetes (las variables pueden prevalecer sobre los archivos). No configurar `LIBREOFFICE_BIN` salvo que se utilice otra ruta válida del ejecutable.
- Incluir `apps/api/assets/reinforcement-annexes` en el despliegue junto al directorio `dist` de la API. No se necesitan Python ni lxml en ejecución.
- Para regenerar las plantillas desde la fuente: `python3 scripts/prepare-reinforcement-annexes.py` (herramienta de mantenimiento que requiere lxml). Solo se marcan los espacios de datos. Los párrafos vacíos de separación entre anexos no generan hojas vacías al exportarlos por separado.

## Verificación

Las pruebas comparan todo el texto de cada anexo vacío con su sección del original, permitiendo únicamente la parametrización de identidad y año. Verifican byte a byte las partes no afectadas del DOCX: estilos, escudo nacional, numeración y propiedades; las únicas otras partes modificadas son el encabezado, sus relaciones y el logo escolar. También comprueban la identidad de los cinco anexos, la proporción del logo, la ausencia de fallback a la escuela fuente y el aislamiento entre instituciones. También prueban nóminas con más de siete alumnos, asistencia con más de ocho fechas y diez alumnos, y escape de XML en los datos insertados.

Se generaron vistas Word y PDF de los cinco anexos utilizando LibreOffice para revisar el formato frente al documento original. El motor de conversión y las fuentes deben mantenerse iguales al comparar renderizados.
