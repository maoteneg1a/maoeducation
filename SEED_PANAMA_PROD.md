# Institución real de prueba: Escuela de Educación Básica "Panamá"

Script: `apps/api/prisma/seeds/seed-panama.ts`

Crea una institución **real** (no demo) con toda la configuración por defecto —roles, permisos, esquema trimestral, niveles/subniveles, banco curricular MINEDUC completo, plantillas PCA, tipos de actividad/incidente, materias cualitativas (vía `bootstrapInstitution`, la misma función que usa el superadmin al crear una institución desde la UI)— más los datos operativos para probar el sistema de punta a punta: año lectivo 2026-2027, un paralelo, la docente titular, el resto de roles institucionales, y 2 estudiantes con representantes.

**Es idempotente**: se puede correr varias veces (local o prod) sin duplicar nada — cada bloque verifica existencia antes de crear.

## Cómo correrlo

**Local:**
```bash
cd apps/api
npx tsx prisma/seeds/seed-panama.ts
```

**Producción (Railway):**
```bash
railway run --service api npx tsx prisma/seeds/seed-panama.ts
```
o desde una shell conectada a la instancia de producción, con `DATABASE_URL`/`DIRECT_URL` apuntando a la DB de prod:
```bash
cd apps/api
npx tsx prisma/seeds/seed-panama.ts
```

No está enganchado al `db:seed` automático (`start:prod`) — es intencional, para no crear esta institución en cada deploy. Se corre manualmente una sola vez por entorno.

## Datos creados

- **Institución:** Escuela de Educación Básica "Panamá" — código `PANAMA_EB`
- **Año lectivo:** 2026-2027 (régimen Costa: 4-may-2026 a 24-feb-2027), 3 trimestres
- **Paralelo:** 5to de Básica "A" — jornada Matutina (Hilda es tutora)
- **Materia:** Matemática (5to Básica), asignada a Hilda

## Usuarios y credenciales

Contraseña temporal para todos: **`Panama2026!`** — pedir cambio en el primer ingreso.

| Rol | Nombre | Email |
|---|---|---|
| Admin | Administración Panamá | admin@panama.edu.ec |
| Docente (5to Básica A, Matemática) | Hilda Rosario Zhangallimbay Guzñay (CI 0106041734) | hilda.zhangallimbay@panama.edu.ec |
| Rector | Rector(a) Panamá | rector@panama.edu.ec |
| Inspector | Inspector(a) Panamá | inspector@panama.edu.ec |
| DECE | DECE Panamá | dece@panama.edu.ec |
| Estudiante | Ana Morocho Quinde (CI 0107001111) | estudiante1@panama.edu.ec |
| Representante de Ana (padre) | Carlos Morocho Vega (CI 0107002222) | representante1@panama.edu.ec |
| Estudiante | Luis Guzñay Pintado (CI 0107003333) | estudiante2@panama.edu.ec |
| Representante de Luis (madre) | Rosa Pintado León (CI 0107004444) | representante2@panama.edu.ec |

## Pendiente antes de usar en producción real

- Cambiar todas las contraseñas temporales tras el primer ingreso.
- Los emails son ficticios (`@panama.edu.ec`) — si la institución tiene dominio de correo real, actualizarlos desde el panel de usuarios antes de invitar a la gente real.
- Ana, Carlos, Luis y Rosa son estudiantes/representantes de prueba — reemplazar o eliminar cuando se matriculen alumnos reales.
- El asistente IA de planificaciones queda **deshabilitado por defecto** para esta institución (`aiConfig.enabled=false`) — activarlo desde Configuración una vez resuelto el acceso a la API de Anthropic (ver nota de red/proxy corporativo en la conversación).
