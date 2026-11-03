# Identidad institucional y acceso a Refuerzo pedagógico

La barra lateral conserva el isotipo de Auleka y su nombre. El nombre de la escuela deja de ocupar el espacio estrecho de esa cabecera y se presenta en la barra superior, junto a su logo configurado. El texto oficial se distribuye en líneas, sin elipsis; si contiene un prefijo como Unidad Educativa, se separa visualmente del nombre propio. No se modifica el nombre guardado en la institución.

El logo se muestra completo, sin recortarlo. Admite el formato configurado, imágenes de datos y rutas relativas de la API. Si falta o no carga, aparece un icono institucional. La búsqueda global permanece disponible y se compacta para dar prioridad a la identidad de la escuela. El usuario mantiene su menú con nombre y roles; el selector de hijos se acomoda en otra línea en pantallas estrechas cuando corresponde.

## Corrección del acceso a Refuerzo

En UEEU se comprobó que Recuperación Pedagógica está habilitada y que el docente tiene permiso de lectura de alertas tempranas. La consulta de casos devuelve 200 con cero registros. Sin embargo, la ruta `/refuerzo/casos` exigía el módulo de planes/adaptaciones, mientras el menú mostraba el enlace sin comprobar ese módulo. Esto provocaba la vuelta al dashboard antes de consultar los casos.

La ruta y el menú comparten ahora la regla: habilitar el escritorio si está disponible `pedagogic_recovery` (institucional) o `reinforcement_plans` (docencia/cuentas personales). Se mantiene el permiso `early_alerts:read` y los controles de acceso de los casos. Sin ninguno de esos módulos, el enlace no aparece y la ruta sigue bloqueada. No se activaron módulos ni se modificó la configuración de la escuela.

Validación: cuatro pruebas de política de módulos, revisión TypeScript y compilación web; Chrome local con API simulada comprobó el acceso institucional sin el módulo de planificación, el estado Sin casos de refuerzo sin redirección, acceso de cuentas con planificación y denegación sin permiso. Se revisaron la cabecera de escritorio y móvil con el nombre completo y el logo ya configurado de la escuela, sin desbordamiento horizontal ni errores de ejecución.

No requiere migración ni carga de datos. Requiere desplegar la web actualizada.
