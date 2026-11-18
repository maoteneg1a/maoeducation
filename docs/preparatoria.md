# Preparatoria: Primero de Básica

La modalidad se limita al código de nivel **1B**. No se aplica a Inicial ni de Segundo en adelante, incluso si otro nivel tiene por error el subnivel “preparatoria”. La API valida esta restricción para la configuración, el registro y los boletines. No cambia materias compartidas, el motor numérico, las notas existentes ni los períodos académicos.

## Flujo sencillo

1. La autoridad abre **Calificar → Tipo de evaluación → Preparatoria · Aprendizajes**, escoge el paralelo y revisa **Configurar Preparatoria**. Los siete ámbitos y 101 indicadores están incluidos; se preparan sin notas y con la modalidad desactivada. El encabezado identifica grado, paralelo, jornada y año. Se elige un docente para todos los ámbitos y, solo si corresponde, se despliega **Especialistas por ámbito** para cambiar las excepciones. Puede escogerse cualquier docente activo de la institución, sin asignaciones de materias. Se revisan la distribución, la escala aplicable y los responsables antes de activar ese paralelo.
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

## Paralelo, jornada y docentes

Cada programa pertenece al ID del paralelo y su año lectivo. Los nombres de la estructura académica distinguen las jornadas, por ejemplo `B-M` (Matutina), `B-V` (Vespertina) y `B-N` (Nocturna). La pantalla muestra estos nombres desarrollados; cuando no hay sufijo conocido indica “Jornada sin indicar”, sin inventar una jornada. No crea otro registro de jornada ni cambia los paralelos existentes.

La configuración de B-M no modifica B-V. Un mismo docente puede recibir uno, varios o todos los ámbitos y trabajar en distintos paralelos. Los responsables se eligen entre usuarios activos con rol docente de la misma institución, independientemente de materias. La tutoría sigue siendo la definida en la estructura académica; asignar ámbitos no cambia al tutor.

El acceso a la tabla y a los boletines individuales o por paralelo contempla estas asignaciones directas. Cambiar un responsable revoca su acceso a los ámbitos anteriores sin borrar valoraciones. La selección de docentes no crea materias ni asignaciones de horario y no amplía el acceso a otros módulos. Esta mejora no requiere otra migración.
