# Respaldos automáticos de PostgreSQL

Servicio independiente para Railway, PostgreSQL 18 y un bucket privado dedicado
en Cloudflare R2. Se ejecuta una vez y termina; no necesita Docker dentro de Railway.

Cada ejecución exporta producción, restaura en un PostgreSQL local temporal sin
TCP, cifra el dump con una clave pública `age`, lo sube al bucket y vuelve a leer
el objeto completo para comprobar su SHA-256. Solo entonces publica
`manifest.json` como comprobante de éxito. Los errores salen con código 1.

El cron es `0 7 * * *`: aproximadamente las 02:00 de America/Guayaquil.
Railway evalúa los horarios en UTC y puede retrasar algunos minutos una ejecución.
No hay programación activa hasta crear y desplegar el servicio en Railway.

## 1. Crear el bucket externo

En Cloudflare → R2, crear `auleka-db-backups` en almacenamiento Standard.
Mantenerlo privado: no habilitar dominio público ni `r2.dev`.

En Settings → Object Lifecycle Rules, añadir una regla habilitada para el prefijo
`auleka/production/postgres/`, que elimine objetos después de 30 días. Conservar
la regla de eliminación de cargas multipart incompletas. Esta configuración es
externa al código; el servicio no elimina respaldos ni cambia reglas del bucket.

Crear credenciales S3 de R2 con permisos de lectura/escritura de objetos limitados
a este bucket. No utilizar el token global de Cloudflare ni las credenciales del
bucket de adjuntos. Conservar endpoint, access key y secret key por un canal privado.

## 2. Crear y custodiar la clave de recuperación

Construir la imagen:

```sh
docker build -t auleka-db-backup:local infra/backups
```

Crear una identidad age con `age-keygen`, guardando su salida directamente en un
archivo privado. El comando `age-keygen -y <archivo>` devuelve solo la clave pública.
No imprimir, subir al repositorio ni compartir la identidad privada por el chat.

La clave pública `age1...` va en `BACKUP_AGE_RECIPIENT`. Guardar la identidad privada
en un gestor de contraseñas y otra ubicación segura independiente de Railway y R2.
Sin esa identidad no se podrán descifrar las copias. Railway no necesita conocerla.
No regenerarla sin conservar las identidades anteriores.

## 3. Crear el servicio Railway

Crear un servicio desde este repositorio, en el mismo ambiente que producción:

- Nombre sugerido: `db-backups`.
- Root Directory: `/infra/backups`.
- Config File: `/infra/backups/railway.json`.
- Builder: Dockerfile. No configurar dominio, volumen ni healthcheck HTTP.
- No heredar comandos de arranque ni de migración de la API.
- Configurar las variables de `.env.example` antes de desplegar.
- `BACKUP_DATABASE_URL`: referencia a la conexión **directa** privada de Postgres,
  por ejemplo `${{Postgres.DATABASE_URL}}` si ese es el nombre real del servicio.
  No usar una conexión de PgBouncer. Se usa TLS y una sesión de lectura.
- `BACKUP_AGE_RECIPIENT`: solo la clave pública de recuperación.
- `BACKUP_S3_*`: credenciales y endpoint del nuevo bucket de backups.

Comprobar en Settings el cron `0 7 * * *` y la política de reinicio `NEVER`.
La imagen ya define su entrypoint; dejar el start command sin override.

## 4. Avisos de fallo o ejecución ausente

Crear un check externo en Healthchecks.io o un servidor compatible con su API,
con período diario, gracia de 2 horas e integración de notificaciones habilitada.
Guardar la URL HTTPS de ping en `BACKUP_HEALTHCHECK_URL`. El servicio notifica
`/start`, éxito y `/fail`, sin adjuntar logs ni datos de usuarios.

El monitor externo detecta también que Railway dejó de ejecutar el cron. Un aviso
emitido solamente por el proceso no detectaría esa situación. Si la variable no
está configurada, el backup funciona pero **no hay alertas externas**.

## 5. Primera ejecución y aceptación

Desplegar o ejecutar manualmente el cron. Comprobar:

1. Logs `restore_verified` y `backup_completed`; proceso finalizado con código 0.
2. R2 contiene `<prefijo>/<fecha-UTC>-<id>/production.dump.age` y `manifest.json`.
3. Manifest con `restoreVerified: true` y `uploadVerified: true`.
4. El monitor registra el éxito y su integración de avisos funciona.
5. Descargar una copia cifrada y probar su descifrado con la identidad custodiada.
6. Revisar la siguiente ejecución automática, no solo la ejecución manual.

La comparación SHA-256 remota verifica la transferencia del objeto cifrado; la
restauración comprueba el dump antes del cifrado. La primera prueba de descifrado
con la identidad real es necesaria para verificar su correcta custodia.

## Recuperar una copia

Descargar `production.dump.age` y su manifest a una carpeta privada. Comprobar
el SHA-256 cifrado, descifrar con `age --decrypt --identity <identidad-privada>`,
y comprobar el SHA-256 del dump contra el manifest. Restaurar con PostgreSQL 18
en una base **nueva y aislada**, usando `pg_restore --exit-on-error --no-owner
--no-privileges --dbname <conexión-local> <dump>`.

No restaurar directamente sobre producción ni sobre el volumen local PostgreSQL
16 existente. Para pruebas de aplicación, anonimizar los datos y desactivar correo,
push y credenciales externas antes de exponer la base a la aplicación de pruebas.

## Alcance

Esto respalda PostgreSQL, sin incluir archivos adjuntos externos, claves de DECE
ni roles globales del servidor. Esos elementos requieren custodia/respaldo aparte.
El dump conserva todos los esquemas y datos de la base seleccionada, mientras que
la verificación de conteos se realiza sobre instituciones y usuarios.

La restauración de verificación diaria se elimina al terminar. No publica un
staging ni refresca semanalmente una base de desarrollo. Ese proceso requiere
una base destino y reglas de anonimización, y se configura por separado.

## Pruebas reproducibles

```sh
docker build --target test -t auleka-db-backup:test infra/backups
```

Las pruebas usan datos ficticios, PostgreSQL 18 y age reales. Comprueban el ciclo
dump/restauración/cifrado/descifrado, la conservación del origen, la ausencia de
publicación si falla la restauración o la integridad remota, y avisos sin secretos.
El transporte S3 se simula: la primera ejecución real valida R2 y sus permisos.

Fuentes:

- [Cron de Railway](https://docs.railway.com/cron-jobs)
- [Configuración en código](https://docs.railway.com/config-as-code)
- [Ciclo de vida en R2](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [Cifrado age](https://github.com/FiloSottile/age)
- [API de Healthchecks](https://healthchecks.io/docs/http_api/)
