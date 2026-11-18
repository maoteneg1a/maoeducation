# Preparatoria: Primero de Básica

La modalidad se limita al código de nivel **1B**. No se aplica a Inicial ni de Segundo en adelante, incluso si otro nivel tiene por error el subnivel “preparatoria”. La API valida esta restricción para la configuración, el registro y los boletines. No cambia materias compartidas, el motor numérico, las notas existentes ni los períodos académicos.

## Flujo sencillo

1. La autoridad abre **Calificar → Tipo de evaluación → Preparatoria · Aprendizajes**, escoge el paralelo y revisa **Configurar Preparatoria**. Los siete ámbitos y 101 indicadores están incluidos; se preparan sin notas y con la modalidad desactivada. Se revisan la distribución, la escala aplicable y los docentes responsables antes de activar ese paralelo.
2. En **Aprendizajes del período**, el docente selecciona únicamente los indicadores que trabajará. Puede reutilizar la selección de otro período o paralelo; no se copian valoraciones.
3. En la tabla registra las letras por alumno e indicador y pulsa **Guardar valoraciones**. Cada especialista consulta y edita solo sus ámbitos; el tutor y la autoridad pueden consultar el conjunto. El tutor registra fortalezas y recomendaciones generales. La pantalla móvil muestra un estudiante a la vez.
4. El boletín habitual muestra automáticamente la tabla de ámbitos y aprendizajes cuando corresponde a Primero y su programa está activado. Se puede consultar en pantalla, descargar el PDF individual o el PDF del paralelo, con varias páginas y encabezados repetidos.

**Pendiente** es una celda sin valoración; **NE** se elige expresamente para un aprendizaje no trabajado. Ninguno se convierte en cero. No se calculan promedios numéricos de estas letras.

Los períodos cerrados se consultan sin modificar la selección ni las valoraciones. Se advierte al salir o cambiar de curso con datos pendientes, también al cambiar desde las notas regulares a Preparatoria. La revisión del programa evita sobrescribir cambios concurrentes.

## Ámbitos precargados

- Identidad y autonomía.
- Convivencia.
- Descubrimiento y comprensión del medio natural y cultural.
- Relaciones lógico-matemáticas.
- Comprensión y expresión oral y escrita.
- Comprensión y expresión artística.
- Expresión corporal.

El catálogo inicial conserva código y versión y necesita revisión institucional de su distribución. La escala se configura por programa. Una vez que existen valoraciones, no se redefine la escala ni la distribución de sus indicadores históricos. Retirar un indicador de la selección no elimina su valoración histórica ni la oculta del informe.

## Instalación y conservación

Aplicar `20261117220000_preparatoria_assessment` antes de publicar el frontend. Crea únicamente `preparatory_programs`, `preparatory_values` y `preparatory_comments`, con sus índices y relaciones. No activa programas ni transforma las calificaciones existentes.

La desactivación conserva el historial y devuelve el boletín de ese paralelo a su flujo habitual. No hay que cambiar `Subject.isQualitative` ni convertir promedios numéricos en valoraciones por indicador. Los otros niveles continúan con la pantalla y boletín existentes.

Las pruebas PostgreSQL solo aceptan `PREPARATORIA_TEST_DATABASE_URL` en `127.0.0.1:55439/juntas_test`. Incluyen una materia compartida entre Primero y Segundo, la conservación de notas y boletín de Segundo, ámbitos, matrícula, institución, períodos cerrados, concurrencia e historial. No se utilizan datos reales.
