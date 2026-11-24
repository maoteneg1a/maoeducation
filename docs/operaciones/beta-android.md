# Beta Android de Auleka

El piloto está dirigido a alumnos y representantes. La app empaqueta el frontend de React en el dispositivo. La PWA docente conserva su flujo. Cada binario usa una URL de API definida en la compilación.

## Compilación de prueba

Desde la raíz del repositorio, con Node 22, pnpm y Android Studio instalados:

```sh
pnpm install --frozen-lockfile
VITE_API_URL=https://api-de-pruebas.example pnpm --filter web build
pnpm --filter web exec cap sync android
```

Abre `apps/web/android` en Android Studio. Usa una API HTTPS de pruebas con cuentas ficticias. Autoriza el origen del WebView en la configuración CORS de esa API y verifica en el dispositivo el inicio de sesión, la renovación por cookie y la apertura de PDF. Antes de invitar a familias, comprueba los permisos de alumno y representante, el cambio de estudiante, el cierre de sesión y la navegación al volver de segundo plano.

La cookie web de renovación conserva `SameSite=Strict`. Android usa el transporte HTTP nativo de Capacitor y envía JSON en las peticiones de sesión que carecen de datos. En el emulador se comprobaron inicio y renovación de sesión, Hoy, Agenda, cambio de estudiante y apertura de un PDF privado. El adjunto pasa a una caché privada y Android concede permiso de lectura al visor seleccionado.

### Piloto local en emulador

La compilación de prueba usa `VITE_API_URL=http://10.0.2.2:33081` para llegar a la API local desde el emulador. HTTP se permite solo en compilaciones de depuración. La semilla `apps/api/scripts/seed-mobile-pilot.cjs` añade dos alumnos vinculados, sus horarios y un PDF ficticio exclusivamente en `auleka_mobile_pilot` en `127.0.0.1:55481`. Se ejecuta después de la semilla base de Escuela Demo.

La migración histórica `20260916120000_reinforcement_case_flow` falló en una base recién creada. Para el piloto se preparó una segunda base vacía con `prisma db push --skip-generate`. Este atajo es para la base desechable, no para despliegues.

## Política móvil

### Variante HTTPS de Escuela Demo

Compila el frontend con `VITE_API_URL=https://api.auleka.com` y `VITE_MOBILE_DEMO_INSTITUTION=ESCUELA_DEMO`. Después de sincronizar, usa `./gradlew -PaulekaAppId=com.auleka.app.demo assembleDebug` desde `apps/web/android`. La variante usa un identificador independiente, mantiene fijo el código de Escuela Demo y acepta los perfiles de alumno y representante. En el emulador se comprobó contra la API HTTPS el acceso de un alumno ficticio, su horario y la renovación de sesión.

La app consulta `GET /api/v1/mobile/policy` con la plataforma y el número de compilación nativo al abrir y volver al primer plano. La API responde sin caché. Configura primero en pruebas las variables por plataforma:

| Variable Android | Función |
| --- | --- |
| `MOBILE_ANDROID_PUBLISHED_BUILD` | Compilación ya disponible en Google Play. |
| `MOBILE_ANDROID_STORE_URL` | Enlace HTTPS de Play Store. |
| `MOBILE_ANDROID_MIN_BUILD` | Compilación mínima admitida. |
| `MOBILE_ANDROID_MAINTENANCE` | Muestra la pantalla de mantenimiento si vale `true`. |
| `MOBILE_ANDROID_NATIVE_PUSH` | Reserva el indicador para notificaciones nativas. |

Para iOS se usa el prefijo `MOBILE_IOS_`. Las variables de versión y mantenimiento aplican a toda la plataforma. La API de la rama agrega `GET /api/v1/mobile/features` para consultar la habilitación efectiva y `PATCH /api/v1/mobile/features` con `{"nativePush":true}` para la administración de su propia institución.

### Push nativo Android

El cliente Firebase está registrado como `com.auleka.mobile`. Guarda el archivo de cliente original en `apps/web/android/app/google-services.json` y compila con ese identificador. Si quieres mantener un identificador de demo distinto, registra ese identificador en Firebase y descarga una configuración que lo incluya. Mantén la cuenta de servicio fuera del repositorio y configúrala en el servidor mediante el secreto `FCM_SERVICE_ACCOUNT_JSON`.

Aplica la migración de dispositivos antes de desplegar. Mantén `MOBILE_ANDROID_NATIVE_PUSH` apagado hasta verificar la entrega en el piloto. El usuario debe conceder permiso en Android. La notificación del sistema usa un texto genérico y el detalle queda en la campana autenticada. El Web Push existente conserva su propio canal.

Mientras la tienda revisa una compilación, conserva la compilación publicada y el mínimo anterior. Verifica que la actualización esté disponible para todos los usuarios afectados, incluidos los de despliegues graduales, antes de elevar el mínimo. Si el mínimo supera el número publicado o el enlace no es válido, la API omite el bloqueo de versión.

Mantén compatible la API con el binario publicado durante la preparación, revisión y adopción de cada versión. Para una corrección urgente, restaura el mínimo anterior o desactiva mantenimiento en la API y vuelve a comprobar con un teléfono. Una solicitud fallida o sin conexión al arrancar permite abrir la app y mostrar el estado normal de conectividad del producto.
