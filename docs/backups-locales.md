# Respaldo de producción y prueba local

Para el servicio automático en Railway con cifrado y almacenamiento externo,
ver [infra/backups/README.md](../infra/backups/README.md). Este documento describe
el procedimiento manual local.

Para recuperar una copia descargada de R2, ver
[restauración local paso a paso](operaciones/restaurar-base-local.md).

Se utiliza Docker Desktop. La conexión de producción se guarda exclusivamente
en `apps/api/.env.backup.local`, con permisos `600`, mediante la variable
`PROD_DATABASE_URL`. Debe ser una conexión pública directa a PostgreSQL.
El archivo y la carpeta `backups/` están excluidos de Git.

Desde la raíz del proyecto, con Docker Desktop abierto:

```sh
python3 scripts/backup-db.py --verify
```

El script consulta la versión de PostgreSQL, genera un dump lógico consistente
con un cliente de la misma versión y calcula su SHA-256. Luego crea un contenedor
temporal sin puertos publicados, restaura el dump y comprueba las tablas y los
conteos de instituciones y usuarios. El contenedor temporal se elimina al finalizar.
No se modifica producción ni se reemplaza la base de desarrollo existente.

Cada ejecución genera una carpeta `backups/<fecha-UTC>/` con:

- `production.dump`: respaldo completo de la base seleccionada.
- `metadata.json`: fecha, versión, tamaño, checksum y resultado de restauración.

Un archivo `.partial` o `restoreVerified: false` no constituye una restauración
verificada. Un fallo del comando devuelve un código distinto de cero.

El respaldo contiene datos reales, sin anonimizar ni cifrar adicionalmente.
Los permisos locales restringen su acceso, pero no sustituyen el cifrado para
copias externas. No subirlo al repositorio, compartirlo ni usarlo en un entorno
de pruebas accesible antes de anonimizarlo.

Este procedimiento es manual: no programa backups, no crea una copia externa
y no actualiza semanalmente desarrollo. Esas tareas se deben configurar aparte
con destino, cifrado, retención y alertas definidos.

El dump no incluye archivos adjuntos externos, roles globales de PostgreSQL ni
claves de cifrado. Conservar la clave de DECE por un canal seguro independiente
y respaldar el almacenamiento de adjuntos para poder recuperar la aplicación.

Producción usa PostgreSQL 18. `pnpm db:up` inicia una instancia local de la misma
versión en `localhost:5434`, con un volumen independiente. El PostgreSQL 16
anterior se conserva en `localhost:5433` mediante el servicio opcional `postgres`.
No apuntar la imagen 18 al volumen 16 existente. Para elegir la base que usa la
API, configurar `DATABASE_URL` y `DIRECT_URL` en `apps/api/.env`; ver el README.
