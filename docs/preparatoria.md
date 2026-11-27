# Preparatoria: Primero de Básica

La modalidad se limita al código de nivel **1B**. No se aplica a Inicial ni de Segundo en adelante, incluso si otro nivel tiene por error el subnivel “preparatoria”. La API valida esta restricción para la configuración, el registro y los boletines. No cambia materias compartidas, el motor numérico, las notas existentes ni los períodos académicos.

## Flujo sencillo

1. La autoridad abre **Configuración → Preparatoria** y escoge un paralelo. Los ocho ámbitos y su distribución de indicadores se comparten entre los paralelos de Primero del mismo año lectivo. En la misma pantalla, la autoridad revisa la escala y asigna los responsables de ese paralelo antes de activarlo. Puede elegir un docente para todos los ámbitos y usar **Especialistas por ámbito** para las excepciones.
2. Al abrir **Calificar**, los docentes con Preparatoria en el año activo entran a **Calificar Preparatoria**. Quienes también tienen asignaturas pueden cambiar con **Calificaciones por asignatura** o **Preparatoria**. En **Elegir aprendizajes**, el docente selecciona los ámbitos que trabajará en ese trimestre y puede ajustar indicadores individuales. Cada selección corresponde al paralelo y período elegidos. También se puede reutilizar la selección de otro período o paralelo sin copiar valoraciones.
3. En la tabla registra las letras por alumno e indicador y pulsa **Guardar valoraciones**. Cada especialista consulta y edita solo sus ámbitos; el tutor y la autoridad pueden consultar el conjunto. El tutor registra fortalezas y recomendaciones generales. La pantalla móvil muestra un estudiante a la vez.
4. El boletín habitual muestra automáticamente la tabla de ámbitos y aprendizajes cuando corresponde a Primero y su programa está activado. Se puede consultar en pantalla, descargar el PDF individual o el PDF del paralelo, con varias páginas y encabezados repetidos.

**Pendiente** es una celda sin valoración; **NE** se elige expresamente para un aprendizaje no trabajado. Ninguno se convierte en cero. No se calculan promedios numéricos de estas letras.

Los períodos cerrados se consultan sin modificar la selección ni las valoraciones. Se advierte al salir o cambiar de curso con datos pendientes, también al cambiar desde las notas regulares a Preparatoria. La revisión del programa evita sobrescribir cambios concurrentes.

Para UEEU 2026–2027, el primer trimestre se inicializa con los 25 indicadores institucionales entregados en `INDICADORES 1ER TRIMESTRE.docx` y el indicador único **Proyecto**. La plantilla se aplica a todos los paralelos de Primero de Básica compatibles, conserva valoraciones previas y no modifica las selecciones de los otros trimestres.

## Ámbitos precargados

- Identidad y autonomía.
- Convivencia.
- Descubrimiento y comprensión del medio natural y cultural.
- Relaciones lógico-matemáticas.
- Comprensión y expresión oral y escrita.
- Comprensión y expresión artística.
- Expresión corporal.
- Proyecto.

El catálogo conserva su código y versión. Las valoraciones del grado protegen la distribución compartida. Las valoraciones de cada paralelo protegen su escala. Los indicadores retirados de la selección conservan su valoración histórica en el informe. Si se había seleccionado una competencia, se muestran sus indicadores como selección inicial del trimestre. Las valoraciones por competencia quedan en el boletín como registros históricos independientes.

## Instalación y conservación

Aplicar `20261117220000_preparatoria_assessment` antes de publicar el frontend. Crea únicamente `preparatory_programs`, `preparatory_values` y `preparatory_comments`, con sus índices y relaciones. La migración `20261126120000_share_preparatoria_distribution` sincroniza los catálogos compatibles de los paralelos que aún no tienen valoraciones y conserva los catálogos ya utilizados para evaluar.

La desactivación conserva el historial y devuelve el boletín de ese paralelo a su flujo habitual. No hay que cambiar `Subject.isQualitative` ni convertir promedios numéricos en valoraciones por indicador. Los otros niveles continúan con la pantalla y boletín existentes.

Las pruebas PostgreSQL solo aceptan `PREPARATORIA_TEST_DATABASE_URL` en `127.0.0.1:55439/juntas_test`. Incluyen una materia compartida entre Primero y Segundo, la conservación de notas y boletín de Segundo, ámbitos, matrícula, institución, períodos cerrados, concurrencia e historial. No se utilizan datos reales.

## Paralelo, jornada y docentes

Cada programa pertenece al ID del paralelo y su año lectivo. Los nombres de la estructura académica distinguen las jornadas, por ejemplo `B-M` (Matutina), `B-V` (Vespertina) y `B-N` (Nocturna). La pantalla muestra estos nombres desarrollados; cuando no hay sufijo conocido indica “Jornada sin indicar”, sin inventar una jornada. No crea otro registro de jornada ni cambia los paralelos existentes.

B-M y B-V comparten la distribución del grado para ese año. Los responsables, la escala, la activación y las selecciones por período corresponden a cada paralelo. Un mismo docente puede recibir uno, varios o todos los ámbitos y trabajar en distintos paralelos. Los responsables se eligen entre usuarios activos con rol docente de la misma institución, independientemente de materias. La tutoría sigue siendo la definida en la estructura académica; asignar ámbitos no cambia al tutor.

El acceso a la tabla y a los boletines individuales o por paralelo contempla estas asignaciones directas. Cambiar un responsable revoca su acceso a los ámbitos anteriores sin borrar valoraciones. La selección de docentes no crea materias ni asignaciones de horario y no amplía el acceso a otros módulos.
