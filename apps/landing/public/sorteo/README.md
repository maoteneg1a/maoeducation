# Ruleta de sorteos

Página estática publicada por la landing de Astro en la ruta `/sorteo/`.

## Ejecutar localmente

Desde la raíz del repositorio:

```bash
pnpm --filter landing dev
```

Abre `http://localhost:4321/sorteo/`. También se puede abrir `index.html` directamente o servir esta carpeta con cualquier servidor estático.

## Publicación

No necesita backend, variables de entorno ni compilación propia. El build normal de `apps/landing` copia `public/sorteo` al artefacto final, por lo que Railway la publica automáticamente junto con el sitio principal.

La configuración y los resultados se guardan en `localStorage` del navegador. El organizador puede definir una cantidad variable de resultados configurados; los siguientes usan Web Crypto con muestreo uniforme. La página informa públicamente esta distinción.

## Modo organizador

La página inicia en modo presentación: la lista de participantes es pública, mientras el orden configurado y sus controles permanecen privados. Pulsa **Organizador** en la barra superior e ingresa el PIN inicial `2026`. El PIN puede cambiarse desde el panel privado.

Como el sitio es completamente estático, este acceso evita mostrar accidentalmente la configuración durante el evento, pero no reemplaza la seguridad de un backend ante alguien con acceso a las herramientas del navegador.
