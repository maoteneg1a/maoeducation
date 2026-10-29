# Auleka: guía práctica de instalación, claves y respaldos

Usa esta guía en orden. Los comandos de instalación se ejecutan en la carpeta
maoeducation. Si ya tienes una copia de producción restaurada, ve al paso 5.

## 1. Guardar las llaves antes de necesitarlas

Guardar en un gestor de contraseñas compartido con las personas responsables:

- El archivo auleka-backups.agekey: abre los backups .dump.age.
- DECE_ENCRYPTION_KEY de producción: abre los registros protegidos de DECE.
- Las credenciales de acceso a Railway, Cloudflare y al repositorio.

En la computadora donde se creó la llave, el archivo está dentro del proyecto:

```text
backups/keys/auleka-backups.agekey
```

En otra computadora, recuperar ese mismo archivo del gestor de contraseñas y
guardarlo en esa misma ruta dentro del proyecto. La carpeta backups no se
descarga al clonar el repositorio. Crear la carpeta si hace falta:

```bash
mkdir -p backups/keys
```

No generar otra llave para abrir una copia anterior. No subir el archivo a Git
ni guardarlo en las variables de Railway. Railway solo necesita la clave pública
BACKUP_AGE_RECIPIENT, que empieza con age1.

## 2. Preparar una computadora nueva

Instalar Git, nvm y Docker Desktop. Instalar DBeaver si quieres ver la base.
En Windows, ejecutar los comandos dentro de WSL2 con Docker Desktop integrado.
Abrir Docker Desktop y dejarlo funcionando.

```bash
git clone https://github.com/maoteneg1a/maoeducation.git
cd maoeducation
nvm install
nvm use
npm install --global pnpm@10.32.1
pnpm setup:local:env
pnpm install --frozen-lockfile
```

Si ya clonaste el proyecto, entrar a su carpeta; no volver a clonarlo.

## 3. Elegir una sola forma de cargar la base

Para empezar con usuarios de ejemplo, ejecutar:

```bash
pnpm setup:local
```

Después continuar en el paso 5.

Para entrar con datos de ejemplo: institución ESCUELA_DEMO, correo
admin@escuela.edu y contraseña Admin1234!. Para la consola de plataforma:
superadmin@mao.edu y contraseña Super1234!.

Para usar una copia de producción, NO ejecutar setup:local. Continuar en el
paso 4: ese procedimiento necesita una base vacía.

## 4. Restaurar una copia de producción en local

Abrir Cloudflare → R2 → auleka-db-backups → auleka/production/postgres/.
Elegir una carpeta y descargar production.dump.age y manifest.json de esa
misma carpeta. Guardarlos dentro del proyecto en backups/restore/.

```bash
mkdir -p backups/restore
pnpm db:up
docker build -t auleka-db-backup:local infra/backups
```

En manifest.json, revisar que restoreVerified y uploadVerified sean true.
Comparar el resultado siguiente con encryptedSha256 del manifest:

```bash
shasum -a 256 backups/restore/production.dump.age
```

Recuperar la llave original como indica el paso 1. Descifrar:

```bash
docker run --rm -i --user 0:0 \
  --mount "type=bind,src=$PWD/backups/keys/auleka-backups.agekey,dst=/identity,readonly" \
  --entrypoint age auleka-db-backup:local \
  --decrypt --identity /identity \
  < backups/restore/production.dump.age \
  > backups/restore/production.dump.partial && \
  mv backups/restore/production.dump.partial backups/restore/production.dump
```

Comparar este resultado con dumpSha256 del manifest. Si alguno no coincide,
descargar nuevamente la copia antes de seguir:

```bash
shasum -a 256 backups/restore/production.dump
```

Con la base nueva vacía, restaurar:

```bash
docker exec -i maoeducation_db18 pg_restore \
  -U maoedu -d maoeducation \
  --no-owner --no-privileges --exit-on-error --single-transaction \
  < backups/restore/production.dump
```

Si ya tienes production.dump descifrado en Downloads, puedes usar
"$HOME/Downloads/production.dump" en la última línea y omitir el descifrado.
Si aparece «already exists», la base tiene tablas: detenerse y elegir otra base
vacía; no borrar la anterior para resolverlo a ciegas.

## 5. Elegir qué base usa la aplicación

Abrir apps/api/.env y configurar:

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://maoedu:maoedu_dev@localhost:5434/maoeducation
DIRECT_URL=postgresql://maoedu:maoedu_dev@localhost:5434/maoeducation
STORAGE_DRIVER=local
```

5434 es la base nueva PostgreSQL 18. 5433 es la base anterior PostgreSQL 16.
Cambiar ambas URLs juntas. Conservar las claves JWT locales que generó el setup.
No copiar todo el archivo .env de producción.

Si restauraste producción, antes de usar la copia con la aplicación, anonimizar
los datos y retirar sesiones y suscripciones push copiadas. Dejar sin configurar
RESEND_API_KEY, VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY. Usar almacenamiento local.

Para aplicar cambios del proyecto a la base ya restaurada:

```bash
pnpm db:migrate:prod
```

No ejecutar setup:local ni db:seed sobre esa copia.

## 6. Entender las claves sin confundirlas

- JWT_SECRET: acceso a la aplicación. El setup crea una propia en apps/api/.env.
- JWT_REFRESH_SECRET: renovación de sesiones. El setup también la genera.
- DECE_ENCRYPTION_KEY: lectura y escritura de registros DECE protegidos. Va en
  API → Variables en Railway y en apps/api/.env en local.
- BACKUP_AGE_RECIPIENT: clave pública age1... para crear backups cifrados. Va en
  db-backups → Variables en Railway.
- auleka-backups.agekey: archivo privado que abre esos backups. Se conserva en
  el gestor de contraseñas y se recupera localmente cuando hace falta restaurar.
- BACKUP_S3_ACCESS_KEY_ID: Access Key ID de R2. Va en db-backups → Variables.
- BACKUP_S3_SECRET_ACCESS_KEY: Secret Access Key de R2. Va en db-backups → Variables.
  No es el valor llamado API Token que muestra Cloudflare.

Para DECE con datos nuevos, generar una clave una sola vez:

```bash
openssl rand -hex 32
```

Guardar el resultado en apps/api/.env:

```dotenv
DECE_ENCRYPTION_KEY=PEGAR_EL_RESULTADO
```

Reiniciar la API. Para leer DECE de una copia de producción, usar la clave
original de producción, recuperada por un canal privado. Una nueva no abre los
registros anteriores. No reemplazar la clave de producción por una nueva.

La carpeta backups guarda descargas, pruebas y la llave local. Railway no lee
esa carpeta. No borrarla sin haber guardado la identidad privada en otro lugar.

## 7. Iniciar y detener el trabajo diario

Abrir Docker Desktop y, desde la carpeta del proyecto:

```bash
nvm use
pnpm dev:local
```

Abrir http://localhost:5173. La API está en http://localhost:3000 y la landing
en http://localhost:4321. Para detener la aplicación, pulsar Ctrl+C.
Para detener la base y conservar sus datos:

```bash
pnpm db:stop
```

## 8. Ver la base en DBeaver

Nueva conexión → PostgreSQL:

- Host: localhost
- Puerto: 5434
- Base: maoeducation
- Usuario: maoedu
- Contraseña: maoedu_dev

Probar conexión → Finalizar → Schemas → public → Tables. Pulsar Refresh si no
aparecen las tablas. Para comprobar los datos:

```sql
SELECT count(*) AS instituciones FROM institutions;
SELECT count(*) AS usuarios FROM users;
```

## 9. Configurar los backups de Railway una sola vez

Si db-backups ya existe y termina con backup_completed, ya está configurado.
Revisar el horario, las alertas y la custodia de las llaves; no crear otro servicio.

Si se configura desde cero, seguir infra/backups/README.md. El resumen es:

- Cloudflare: bucket privado auleka-db-backups, retención de 30 días para
  auleka/production/postgres/ y credenciales Object Read & Write solo para ese bucket.
- Railway: servicio db-backups desde este repositorio, Root Directory /infra/backups,
  Config File /infra/backups/railway.json y sin comando de inicio personalizado.
- Variables: copiar infra/backups/.env.example y completar endpoint, Access Key ID,
  Secret Access Key y la clave pública age1... correspondiente a la identidad custodiada.
- BACKUP_DATABASE_URL debe referenciar la conexión privada directa de Postgres.
- Horario: 0 7 * * *, todos los días aproximadamente a las 02:00 de Ecuador.
- Alertas: crear un check diario en Healthchecks, con 2 horas de gracia y aviso
  por correo; guardar su URL de ping en BACKUP_HEALTHCHECK_URL.
- Ejecutar una prueba: deben aparecer restore_verified y backup_completed, y
  una carpeta nueva en R2 con production.dump.age y manifest.json.

## 10. Si falla la base de Railway

Restaurar la copia en una base nueva de Railway, comprobarla y después conectar
la API a ella. Conservar la base anterior durante la comprobación.

El procedimiento completo está en docs/operaciones/recuperar-railway.md y en la
sección «Recuperar la base en Railway» de Documentación de plataforma.

Se recupera el estado de la fecha elegida: lo guardado después de esa copia no
está en el respaldo. El dump no incluye los archivos adjuntos del bucket ni las
llaves privadas. Conservar también acceso al almacenamiento de adjuntos.
