# Restaurar un respaldo de producción en local

Esta guía restaura una copia en PostgreSQL 18 de Docker Desktop. La aplicación
elige su base mediante DATABASE_URL y DIRECT_URL en apps/api/.env.

## 1. Elegir el destino

Ejecutar desde la raíz del repositorio, con Node 22, pnpm y Docker Desktop:

```bash
nvm use
pnpm db:up
```

La instancia nueva es maoeducation_db18, en localhost:5434. La base se llama
maoeducation y las credenciales locales son maoedu / maoedu_dev.
La instancia anterior de PostgreSQL 16 continúa en localhost:5433.

La base destino debe estar vacía. No ejecutar pnpm setup:local antes de
restaurar: ese comando crea tablas y usuarios demo. Si ya hay datos, conservarlos
y crear otra base vacía antes de restaurar. No utilizar --clean, migrate reset
ni docker compose down -v para intentar resolver errores de restauración.

## 2. Descargar la copia

En Cloudflare R2, abrir auleka-db-backups → auleka/production/postgres/ y elegir
una carpeta con manifest.json. Descargar de esa misma carpeta los dos archivos:

- production.dump.age: copia cifrada.
- manifest.json: fecha, versión, checksums y resultado de verificación.

Guardar ambos en backups/restore/ dentro del proyecto. Esa carpeta está excluida
de Git. Revisar que el manifest indique restoreVerified y uploadVerified en true.
Si el archivo que tienes ya termina en .dump y está descifrado, pasa al paso 4.

## 3. Descifrar un archivo .dump.age

Primero obtener el SHA-256 del archivo descargado y compararlo con el valor
encryptedSha256 de manifest.json. Si no coincide, detenerse y descargar de nuevo.

```bash
shasum -a 256 backups/restore/production.dump.age
```

Necesitas la identidad privada age que se utilizó para esta copia. En el equipo
original se guardó en backups/keys/auleka-backups.agekey; en otro equipo debes
recuperarla del gestor de contraseñas. No generar una nueva: no descifraría las
copias anteriores. No subir la identidad al repositorio ni pegarla en chats.

El siguiente comando usa la imagen de herramientas del proyecto; la clave
se monta en modo de solo lectura y no se imprime:

```bash
docker build -t auleka-db-backup:local infra/backups
docker run --rm -i --user 0:0 \
  --mount "type=bind,src=$PWD/backups/keys/auleka-backups.agekey,dst=/identity,readonly" \
  --entrypoint age auleka-db-backup:local \
  --decrypt --identity /identity \
  < backups/restore/production.dump.age \
  > backups/restore/production.dump.partial && \
  mv backups/restore/production.dump.partial backups/restore/production.dump
```

Si falla age, el archivo .partial no se puede restaurar. Si termina bien,
comparar el checksum del archivo descifrado con dumpSha256 del manifest:

```bash
shasum -a 256 backups/restore/production.dump
```

## 4. Restaurar el dump descifrado

Con la base maoeducation vacía, ejecutar:

```bash
docker exec -i maoeducation_db18 pg_restore \
  -U maoedu \
  -d maoeducation \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --single-transaction \
  < backups/restore/production.dump
```

Ajustar la ruta del archivo si está en otra carpeta. Por ejemplo, usar
"$HOME/Downloads/production.dump" en la última línea si está en Descargas.
Este comando ejecuta pg_restore 18 dentro de Docker; no requiere instalar las
herramientas nativas de PostgreSQL en el equipo. Nunca pasarle el archivo .age.

La operación se ejecuta en una sola transacción: si falla, no queda aplicada
parcialmente. Si aparece «already exists», revisar que la base esté vacía;
no reemplazar ni borrar datos automáticamente. Si aparece «unsupported version
in file header», comprobar que se esté usando el contenedor PostgreSQL 18.

## 5. Revisar en DBeaver

Crear una conexión PostgreSQL con estos valores:

- Host: localhost
- Puerto: 5434
- Base: maoeducation
- Usuario: maoedu
- Contraseña: maoedu_dev

Probar la conexión, finalizar y actualizar Schemas → public → Tables. Se pueden
comparar los conteos con restored.counts en manifest.json:

```sql
SELECT count(*) AS instituciones FROM institutions;
SELECT count(*) AS usuarios FROM users;
```

El driver JDBC de DBeaver sirve para conectar. La opción Restore de DBeaver
requiere un cliente nativo pg_restore 18; el comando Docker del paso anterior
permite restaurar aunque ese cliente no esté instalado en el equipo.

## 6. Conectar la aplicación a la copia

La copia contiene datos reales. Antes de utilizarla con la aplicación,
anonimizar los datos, eliminar sesiones y suscripciones push copiadas y mantener
sin configurar RESEND_API_KEY, VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY. Usar claves
JWT propias y almacenamiento local; no copiar el .env ni las credenciales S3
de producción. Los datos cifrados DECE requieren custodiar su clave aparte.

Editar apps/api/.env:

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://maoedu:maoedu_dev@localhost:5434/maoeducation
DIRECT_URL=postgresql://maoedu:maoedu_dev@localhost:5434/maoeducation
STORAGE_DRIVER=local
```

Conservar las claves JWT locales existentes. Revisar que no haya URLs de base
exportadas en la terminal que sobrescriban el archivo. Con ambas URLs apuntando
a la copia local, aplicar solo las migraciones pendientes y reiniciar la API:

```bash
pnpm db:migrate:prod
pnpm dev:local
```

No ejecutar setup:local ni db:seed sobre la copia restaurada: añadirían usuarios
demo. El respaldo de PostgreSQL no incluye los adjuntos del bucket ni las claves
DECE. Sin esos elementos, ciertas funciones o archivos pueden no estar disponibles.
