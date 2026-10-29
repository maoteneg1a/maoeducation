# Auleka / MaoEducación

Monorepo con API Fastify/Prisma, aplicación React y sitio público Astro.

## Instalar desde cero

Requisitos: Git, Node.js 22 (22.13 o superior dentro de la rama 22),
pnpm 10.32.1 y Docker Desktop abierto. En Windows, usar WSL2 para los comandos
de shell. No se necesitan credenciales de Railway o Cloudflare para desarrollo.

```sh
git clone https://github.com/maoteneg1a/maoeducation.git
cd maoeducation
nvm install
nvm use
# Si pnpm no está instalado:
npm install --global pnpm@10.32.1

pnpm setup:local:env
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev:local
```

`setup:local:env` crea los tres archivos `.env` que falten, genera claves JWT
propias y no sobrescribe archivos existentes. `setup:local` levanta PostgreSQL
18, genera Prisma Client, inicializa el esquema y carga usuarios demo y catálogos
curriculares. Es para una instalación local nueva: valida que ambas conexiones
apunten a `localhost:5434/maoeducation` antes de migrar o sembrar.

En una base vacía, crea el esquema actual con Prisma y registra las migraciones
existentes mediante `prisma migrate resolve --applied`. El historial antiguo
contiene una referencia a una columna antes de su creación, por lo que no puede
reproducirse desde cero. Este baseline local conserva los archivos y checksums
de producción. En ejecuciones posteriores solo aplica migraciones pendientes.
Un estado privado en `.local-setup/` permite reanudar si se interrumpe el baseline;
el comando nunca utiliza `migrate reset` ni acepta pérdida de datos.

Direcciones:

| Componente | URL |
|---|---|
| Aplicación | http://localhost:5173 |
| API | http://localhost:3000 |
| Landing | http://localhost:4321 |

Usuarios demo locales: institución `ESCUELA_DEMO`, administrador
`admin@escuela.edu` / `Admin1234!`. Plataforma: `superadmin@mao.edu` /
`Super1234!`. Estos accesos se crean al ejecutar el seed, no al arrancar Docker.

## Qué base usa la aplicación

La API lee **`apps/api/.env`**. Estas dos variables seleccionan la base:

```dotenv
DATABASE_URL=postgresql://maoedu:maoedu_dev@localhost:5434/maoeducation
DIRECT_URL=postgresql://maoedu:maoedu_dev@localhost:5434/maoeducation
```

`DATABASE_URL` es la conexión de la aplicación. `DIRECT_URL` se utiliza para
migraciones. En local ambas apuntan a la misma base. Reiniciar la API después
de cambiarlas. Revisar también que la terminal no tenga estas variables
exportadas con otro valor: las variables de proceso tienen prioridad sobre `.env`.

El frontend usa `apps/web/.env`, con `VITE_API_URL=http://localhost:3000`.
La landing usa `apps/landing/.env`. Ninguno se conecta directamente a PostgreSQL.

`pnpm dev:local` respeta la conexión local existente: levanta el servicio 18 si
el puerto es 5434 o el servicio anterior si es 5433. No cambia el `.env` ni
ejecuta semillas, restauraciones o migraciones en cada arranque.

## PostgreSQL y DBeaver

| Instancia | Contenedor | Host / puerto | Base | Usuario / contraseña |
|---|---|---|---|---|
| Local predeterminada, PostgreSQL 18 | `maoeducation_db18` | `localhost:5434` | `maoeducation` | `maoedu` / `maoedu_dev` |
| Anterior, PostgreSQL 16 | `maoeducation_db` | `localhost:5433` | `maoeducation` | `maoedu` / `maoedu_dev` |

Los volúmenes son independientes. La imagen 18 monta `/var/lib/postgresql`,
como requiere la imagen oficial desde PostgreSQL 18. El volumen de 16 conserva
su ruta y contenido. No apuntar una imagen nueva al volumen anterior.

```sh
pnpm db:up                         # Solo PostgreSQL 18; espera a que esté listo
pnpm db:stop                       # Detener 18, conservar datos
docker compose up -d postgres      # Iniciar PostgreSQL 16 explícitamente
```

Para un proyecto nuevo, `docker compose up -d` inicia únicamente PostgreSQL 18.
El servicio de 16 pertenece al perfil opcional `legacy`. Detener contenedores
no elimina los datos. `docker compose down -v` sí elimina volúmenes: no usarlo
para detener el entorno o cambiar de versión.

En una instalación existente, el setup conserva `.env`. Si apunta al puerto
5433, puedes seguir usando la base anterior con `pnpm dev:local`. Para cambiar
a la nueva, edita las dos URLs de la API y reinicia el backend.

## Cargar una copia de producción

Guía completa con comandos de Docker, descifrado y configuración de DBeaver:
[Restaurar un respaldo en local](docs/operaciones/restaurar-base-local.md).
También se consulta en la consola de plataforma → Documentación
(`/platform/documentation`), con una cuenta de propietario de plataforma.

Para restaurar manualmente en DBeaver, iniciar la instancia 18 con `pnpm db:up`
y conectarse al puerto 5434. Si vas a restaurar sobre `maoeducation` vacía,
no ejecutar antes `setup:local`: cargaría un esquema y datos demo.

1. Descargar `production.dump.age` y `manifest.json` del mismo respaldo de R2.
2. Comprobar el SHA-256 cifrado indicado en el manifest.
3. Descifrar con la identidad privada age y comprobar el SHA-256 del dump.
4. Restaurar el dump descifrado en una base vacía de PostgreSQL 18, usando
   `pg_restore --exit-on-error --no-owner --no-privileges`. DBeaver necesita
   herramientas nativas PostgreSQL 18 para Restore; el driver JDBC solo sirve
   para conectar y ejecutar consultas.
5. Para repetir la restauración, crear otra base vacía o respaldar/revisar
   expresamente el reemplazo de la anterior. No mezclar datos con seeds.
6. Anonimizar datos y desactivar correo/push/credenciales externas antes de usar
   la copia con la aplicación. Generar claves JWT locales; no copiar el `.env`
   de producción. Custodiar la clave DECE aparte si se necesita recuperar sus datos.
7. Apuntar `DATABASE_URL` y `DIRECT_URL` a la base restaurada. Aplicar solamente
   las migraciones pendientes con `pnpm db:migrate:prod`; no ejecutar el setup
   completo ni volver a sembrar los usuarios demo sobre la copia de producción.

Las claves y copias no se distribuyen con el proyecto: una persona nueva puede
instalar el entorno demo desde cero sin acceso a datos reales.

## Configuración y comandos

El ejemplo de API local es `apps/api/.env.example`; el ejemplo para Railway es
`apps/api/.env.production.example`. En producción cada servicio configura sus
variables en Railway. Cambiar un `.env` local no cambia la base de Railway.

IA, correo, notificaciones push y S3 son opcionales en desarrollo. Los adjuntos
se guardan en disco local por defecto. Para habilitar DECE, crear una clave con
`openssl rand -hex 32`, guardarla en `DECE_ENCRYPTION_KEY` y conservarla.

```sh
pnpm lint
pnpm test:setup
pnpm db:migrate       # Crear/aplicar una migración durante desarrollo
pnpm db:migrate:prod  # Aplicar migraciones existentes sin crear otras
pnpm db:studio
```

Ver [respaldo manual](docs/backups-locales.md) y
[servicio de respaldos automáticos](infra/backups/README.md).

## Mantener la documentación de operaciones

Editar `docs/operaciones/restaurar-base-local.md` y ejecutar `pnpm docs:sync`.
La guía se incorpora al servidor para que la API pueda exigir una sesión de
propietario de plataforma; el frontend no incluye su contenido como archivo
público. `pnpm docs:check` comprueba que el contenido generado esté actualizado.
La compilación de la API también lo sincroniza antes de empaquetarlo.
La ruta de consulta es `/platform/documentation`.
