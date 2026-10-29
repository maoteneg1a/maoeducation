# Rutas y protocolos DECE — primera entrega

Módulo independiente de Incidentes para recepción de alertas y seguimiento de expedientes confidenciales. Implementa la primera entrega acordada: activación institucional, visibilidad por rol, reporte mínimo, receptor y suplente, expediente restringido, bitácora y auditoría. La propuesta funcional entregada por el usuario se utilizó como referencia de diseño; no constituye una ruta oficial publicada por AULEKA.

## Activación

1. Desplegar la migración `20261025000000_dece_protection_routes` antes de iniciar la nueva API. El arranque de producción existente ejecuta `prisma migrate deploy`.
2. Aplicar también `20261104000000_dece_plain_content`. DECE no requiere una clave adicional: guarda reportes y actuaciones como JSON con acceso restringido. La migración se detiene si detecta registros cifrados anteriores; no los elimina ni los convierte sin su clave histórica.
3. En Plataforma → Instituciones → Módulos, habilitar **Rutas y protocolos DECE** (`dece_routes`) si la institución tiene una lista explícita de módulos.
4. En Administración → **Configurar DECE**, seleccionar dos responsables distintos, activos y con función DECE, rector o inspector. Definir un canal alternativo real y validado por la institución.
5. Elegir los roles que verán el módulo y los que pueden reportar; luego habilitar nuevos reportes. Los roles personalizados aparecen en esta matriz. La recepción está desactivada por defecto.

Desactivar el módulo en plataforma o desactivar nuevos reportes bloquea nuevas alertas por API. Los responsables siguen consultando los expedientes que ya tienen asignados. Cambiar la configuración de recepción no traslada automáticamente expedientes anteriores ni concede acceso a sus relatos.

## Recorrido

- **Comunidad educativa:** formulario breve con tipo general de preocupación, peligro inmediato o desconocido, persona que necesita ayuda, fecha/lugar aproximados, relato y contacto seguro opcional. No se solicitan adjuntos ni diagnósticos. El usuario autenticado recibe exclusivamente referencia y fecha de recepción; sus confirmaciones no revelan responsables, actuaciones o estado interno.
- **Recepción:** el titular recibe el expediente; si está excluido o inactivo se utiliza al alternativo. Si ninguno es seguro no se guarda una alerta sin responsable: se conserva el formulario y se indica usar el canal alternativo. La interfaz recuerda que la atención urgente precede al registro digital.
- **Gestores:** bandeja autorizada con estado e indicador de peligro comunicado, resumen, bitácora de notas/medidas/derivaciones/seguimiento, cambio de estado con justificación y administración de accesos. Las derivaciones son constancias de acciones realizadas, no envíos a autoridades ni denuncias digitales.
- **Consulta autorizada:** permite leer el expediente y su bitácora; no permite cambiar estado, registrar actuaciones ni administrar participantes o auditorías.
- **Cierre:** se denomina cierre administrativo interno. Bloquea nuevas actuaciones hasta reabrir el seguimiento con justificación; no declara concluida una investigación externa.

Las listas iniciales presentan las últimas 100 confirmaciones y los 100 expedientes autorizados actualizados más recientemente. Las referencias conservan su enlace directo. La auditoría muestra los últimos 200 eventos del expediente.

## Acceso y conflictos

El administrador técnico puede configurar la recepción pero no obtiene lectura de expedientes por tener rol admin, permisos comodín o acceso a Incidentes. Tampoco todos los usuarios DECE ven todos los casos. Cada lectura y escritura requiere pertenencia explícita al expediente, institución correcta, cuenta activa y función institucional autorizada. Se consultan roles actuales en la base; no se confía en permisos antiguos del JWT.

Las exclusiones prevalecen sobre cualquier concesión de acceso. Se pueden indicar al reportar y añadir posteriormente por un gestor. No hay operación para retirar silenciosamente una exclusión. Antes de retirar o degradar al último gestor se debe autorizar a otro responsable. Los accesos concedidos a otras instituciones se rechazan.

El suplente queda registrado por expediente sin acceso inicial cuando el titular está disponible. Si un expediente abierto pierde todos sus gestores activos con función autorizada, la siguiente consulta del suplente al módulo activa su asignación y deja constancia. Una exclusión, revocación o degradación explícita cancela esa suplencia. Los expedientes cerrados no se reasignan automáticamente. La institución debe realizar el traspaso de responsabilidades antes de desactivar a todo el equipo; no existe un acceso técnico universal de recuperación.

## Protección y auditoría

- Relatos, identidad declarada del reportante, datos de contacto y contenidos de las actuaciones se cifran con AES-256-GCM, IV aleatorio y contexto autenticado de institución/expediente/actuación.
- Se conservan metadatos operativos: referencias, actores, permisos, estado, indicador de urgencia comunicado y fechas. No se presentan como diagnósticos ni clasificación clínica.
- Las notificaciones son internas a AULEKA y genéricas; no incluyen nombres, relatos o categorías. Solo se avisa a destinatarios autorizados y no excluidos. No se envían automáticamente correos, mensajes externos o avisos al representante.
- Se auditan creación, lectura, actuaciones, cambios de estado, autorizaciones, revocaciones, exclusiones, suplencia y consultas de auditoría/configuración. Los intentos denegados se registran sin incluir referencias ajenas ni contenidos.
- PostgreSQL bloquea UPDATE, DELETE y TRUNCATE sobre auditorías y actuaciones mediante triggers. Es una protección frente a modificación ordinaria; un propietario de la base conserva capacidades administrativas y requiere controles operativos independientes.
- La API responde `Cache-Control: no-store`; las consultas de interfaz incluyen institución y usuario en sus claves, no persisten expedientes en el almacenamiento del navegador y se descartan al dejar de usarse. Los errores de este módulo no registran bodies ni excepciones con parámetros sensibles.
- No se usan carpetas públicas de adjuntos, IA, exportaciones ni endpoints del módulo de Incidentes para estos expedientes.

## Verificación

Se probó la migración real sobre un esquema anterior en PostgreSQL 16 efímero. La suite de integración en `apps/api/src/modules/dece/application/dece.integration.test.ts` usa Fastify con JWT y una conexión expresamente restringida a `127.0.0.1:55439/dece_test`. No utiliza `DATABASE_URL`; sin `DECE_TEST_DATABASE_URL` se omite. Solo crea datos ficticios y no borra datos preexistentes.

Con esa base efímera preparada y la migración aplicada:

```sh
DECE_TEST_DATABASE_URL=postgresql://postgres:dece-test-only@127.0.0.1:55439/dece_test pnpm --filter api exec vitest run
```

La interfaz se verificó en Chrome con todas las llamadas API interceptadas y datos ficticios: guardar configuración por rol; enviar alerta con exclusión; consultar resumen/bitácora; autorizar consulta; ocultar controles de gestión a un usuario de consulta; y diseño móvil de 390 px sin desbordamiento. Ninguna comprobación accedió o escribió en producción.

Capturas de ejemplo:

- [Configuración por rol](screenshots/configuracion.png)
- [Reporte de una preocupación](screenshots/reporte.png)
- [Expediente autorizado](screenshots/expediente.png)
- [Reporte en móvil](screenshots/reporte-movil.png)

## Siguiente entrega y validación institucional

Quedan para la segunda entrega el catálogo y motor de protocolos oficiales versionados, pasos condicionales, plazos validados, tareas, documentos específicos y derivación controlada desde Incidentes. Esta entrega no incorpora protocolos normativos activos, archivos de evidencia, reportes anónimos, integraciones distritales, MFA ni un mecanismo excepcional de recuperación de expedientes.

Antes de usar casos reales sensibles, la institución debe validar sus canales, responsables, privacidad, conservación, controles de autenticación y rutas oficiales aplicables con los profesionales competentes. Los permisos implementados no equivalen por sí solos a una certificación jurídica o de seguridad. No se activó el módulo ni se modificaron secretos, configuración o datos de Railway durante esta implementación.
