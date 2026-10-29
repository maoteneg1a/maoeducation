# Recuperar la base en Railway

Usar este procedimiento si hay que recuperar producción desde una copia de R2.
La restauración se hace en una base nueva. La base original se conserva.

## 1. Preparar la copia

Si la API todavía funciona, ponerla en mantenimiento o detener temporalmente
sus escrituras antes del cambio de base. Si el problema es solo un despliegue
de código y la base está sana, recuperar primero la versión de la aplicación;
no hace falta restaurar la base por cada fallo de despliegue.

Elegir en R2 un respaldo anterior al problema. Descargar production.dump.age y
manifest.json de la misma carpeta a backups/restore/.

Recuperar del gestor de contraseñas:

- La identidad privada original, y guardarla en backups/keys/auleka-backups.agekey.
- DECE_ENCRYPTION_KEY de producción si se perdió la configuración de la API.

Descifrar y comprobar los dos checksums como indica el paso 4 de la guía
práctica o la guía de restauración local. El resultado debe ser:

```text
backups/restore/production.dump
```

## 2. Crear una base nueva en Railway

En el mismo proyecto y ambiente production:

- New → Database → PostgreSQL.
- Nombrar el nuevo servicio PostgresRecovery.
- Comprobar que use PostgreSQL 18 y tenga almacenamiento persistente.
- Esperar a que esté disponible. Mantener vacía la base: no conectar todavía la API.
- Abrir su información de conexión pública directa. Si hace falta, habilitar
  un proxy TCP para conectar desde tu computadora durante la recuperación.

La conexión pública se utiliza solo para cargar la copia desde tu computadora.
La API y el servicio de backups usarán después conexiones privadas de Railway.

## 3. Guardar la conexión nueva en un archivo privado

Desde la carpeta del proyecto:

```bash
mkdir -p backups/recovery
touch backups/recovery/railway.env
chmod 600 backups/recovery/railway.env
```

Abrir ese archivo con tu editor y completar con los datos de PostgresRecovery:

```dotenv
PGHOST=HOST_PUBLICO_DE_POSTGRES_RECOVERY
PGPORT=PUERTO_PUBLICO_DE_POSTGRES_RECOVERY
PGUSER=USUARIO_DE_POSTGRES_RECOVERY
PGPASSWORD=CONTRASENA_DE_POSTGRES_RECOVERY
PGDATABASE=NOMBRE_DE_LA_BASE_NUEVA
PGSSLMODE=require
PGCONNECT_TIMEOUT=30
```

Reemplazar los textos en mayúsculas por los valores del nuevo servicio. Usar
los campos individuales de conexión, sin codificar la contraseña como URL.
Este archivo queda dentro de backups, excluido de Git. No pegar la conexión
ni la contraseña en el chat.

## 4. Comprobar el destino antes de restaurar

```bash
docker run --rm \
  --env-file backups/recovery/railway.env \
  postgres:18-alpine \
  psql -X -v ON_ERROR_STOP=1 -c "SHOW server_version;" \
  -c "SELECT count(*) AS tablas FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
```

La versión debe ser 18 y el conteo de tablas debe ser 0. Confirmar que los datos
del archivo pertenecen a PostgresRecovery, no al Postgres original.

## 5. Restaurar en la base nueva

```bash
docker run --rm -i \
  --env-file backups/recovery/railway.env \
  --entrypoint sh postgres:18-alpine \
  -c 'exec pg_restore --dbname="$PGDATABASE" --no-owner --no-privileges --exit-on-error --single-transaction' \
  < backups/restore/production.dump
```

Esperar a que termine sin errores. El comando toma la conexión del archivo
privado y restaura en una sola transacción. No usar un archivo .age directamente.

## 6. Comprobar los datos recuperados

```bash
docker run --rm \
  --env-file backups/recovery/railway.env \
  postgres:18-alpine \
  psql -X -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) AS instituciones FROM institutions;" \
  -c "SELECT count(*) AS usuarios FROM users;"
```

Comparar con restored.counts en manifest.json. Confirmar la fecha de la copia.
Si hay errores, conservar la base original y resolverlos antes de cambiar la API.

## 7. Conectar la API a la base recuperada

En Railway → API → Variables, conservar una copia de las referencias actuales y
actualizar ambas conexiones. Si se utiliza conexión directa, el ejemplo es:

```dotenv
DATABASE_URL=${{PostgresRecovery.DATABASE_URL}}
DIRECT_URL=${{PostgresRecovery.DATABASE_URL}}
```

Si la API usa PgBouncer, reconfigurar también el pooler hacia PostgresRecovery:
DATABASE_URL debe seguir apuntando al pooler y DIRECT_URL a la conexión directa
nueva. No dejar el pooler conectado a la base anterior.

Conservar DECE_ENCRYPTION_KEY con su valor original y el resto de las variables
de la API. Conservar también las credenciales del bucket de adjuntos.

Antes de desplegar, configurar en Settings de la API:

- Pre-deploy Command: pnpm --filter api db:migrate:prod
- Start Command: pnpm --filter api start

Estos comandos aplican las migraciones y arrancan la API sin ejecutar el seed
de demostración. Usar una versión de API compatible con el respaldo; no usar
start:prod durante esta recuperación porque también ejecuta db:seed.

Entrar a la aplicación y comprobar inicio de sesión, una institución, estudiantes,
calificaciones y un registro DECE protegido. Después reabrir el servicio.

## 8. Reanudar los respaldos

En db-backups → Variables, actualizar:

```dotenv
BACKUP_DATABASE_URL=${{PostgresRecovery.DATABASE_URL}}
```

Conservar la clave pública age y las credenciales de R2. Ejecutar el servicio y
comprobar backup_completed y una carpeta nueva en R2. Verificar que el monitor
reciba el aviso de éxito. Retirar el proxy TCP temporal si ya no se necesita.

Conservar la base anterior hasta confirmar la recuperación. Si lo que falla es
toda la plataforma Railway, esperar a que vuelva o preparar PostgreSQL 18 en otro
proveedor: el dump y la llave permiten restaurar fuera de Railway también.

## Qué se necesita conservar

R2 guarda la base cifrada hasta la fecha de cada respaldo. La identidad age abre
el archivo; DECE_ENCRYPTION_KEY abre los registros DECE dentro de la base. Son
llaves distintas. Los adjuntos necesitan además su almacenamiento original.

Referencia: https://docs.railway.com/databases/postgresql
