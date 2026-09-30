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

La configuración y los resultados se guardan en `localStorage` del navegador. Los cinco primeros resultados son los seleccionados en el panel; desde el sexto se usa Web Crypto con muestreo uniforme.
