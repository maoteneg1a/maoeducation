# Matrícula con códigos de extranjeros

La creación individual y la importación de estudiantes admiten:

- Cédula numérica de diez dígitos.
- Código alfanumérico de 6 a 20 caracteres, con al menos una letra y un número.

Los códigos se guardan en mayúsculas, sin espacios exteriores. No se eliminan letras, signos ni espacios interiores para convertir un documento inválido en válido. Es una validación de formato, sin comprobación oficial del documento. El identificador y la contraseña inicial conservan el documento completo, siguiendo el comportamiento existente de matrícula.

La plantilla conserva las columnas `cedula`, `nombres`, `apellidos` y `fecha_nacimiento` opcional. Guardar documentos como texto permite conservar letras y ceros iniciales. Si Excel entrega una celda numérica de nueve dígitos, el lector mantiene la recuperación preexistente de un cero inicial; los documentos de nueve dígitos recibidos como texto no se completan automáticamente.

La vinculación masiva de representantes también conserva el código del estudiante. No cambia la validación del documento propio del representante ni el importador de personal.

## Preparación local de lotes

`scripts/prepare-estados-unidos-enrollment.mjs` prepara los lotes de la institución para 2026-2027 a partir de un análisis documental local. No accede a una base de datos ni carga matrículas. Requiere Node 22 y las dependencias instaladas del workspace web.

```sh
node scripts/prepare-estados-unidos-enrollment.mjs \
  .local-setup/estados-unidos-2026-11-03/analysis.json \
  .local-setup/estados-unidos-2026-11-03/entrega
```

La entrada es un JSON con `groups`, `students`, `duplicates`, `student_count` y `unique_dni`, obtenido en la revisión documental. Cada estudiante conserva `group`, `number`, `dni`, `fullName` y `source`; cada grupo incluye `code`, `grade`, `parallel`, `shift`, `excel` y `difference`. Este script está adaptado a esa estructura y a esa entrega, no es un lector genérico de PDF.

Genera un Excel por grupo, un manifiesto, novedades en Markdown/Excel y una propuesta de configuración sin aplicar. Solo la primera hoja `Estudiantes` se importa; las hojas adicionales conservan trazabilidad y destino. Los duplicados, documentos incompatibles y nombres que no permiten separación quedan apartados y visibles en las novedades. La separación propuesta de nombres/apellidos requiere revisión previa a la carga.

Todos los resultados con datos personales deben permanecer en `.local-setup/`, ignorada por Git. Los documentos fuente y los Excel generados no forman parte del despliegue. Antes de importar en producción se debe desplegar el soporte alfanumérico y verificar los destinos, distinguiendo paralelo y jornada.
