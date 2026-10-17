# Conector Auleka → Educar Ecuador

Prototipo controlado para cargar calificaciones sin compartir las credenciales de Educar Ecuador con Auleka.

## Instalación de prueba

1. Abre `chrome://extensions` en Chrome.
2. Activa **Modo desarrollador**.
3. Pulsa **Cargar extensión sin empaquetar**.
4. Selecciona esta carpeta: `tools/educarecuador-connector`.

## Uso

1. En Auleka abre **Notas → Ver resumen**, selecciona materia y trimestre y pulsa **Enviar a Educar Ecuador**. Se exporta únicamente el **promedio final del trimestre**, no las actividades ni los insumos.
2. Inicia sesión en Educar Ecuador y abre esa misma materia y trimestre.
3. Abre la extensión, selecciona el archivo JSON descargado y pulsa **Previsualizar coincidencias**.
4. Revisa encontrados, bloqueados y ausentes. Solo entonces pulsa **Cargar notas confirmadas**.

La extensión no conoce ni almacena la contraseña. No modifica campos deshabilitados o de solo lectura.
Antes de habilitar la carga compara obligatoriamente la materia y el grado del archivo con el encabezado visible en Educar Ecuador. Si Auleka exporta sexto y el portal está abierto en tercero, se detiene. El paralelo debe confirmarse visualmente porque la vista interna del portal no siempre lo muestra.
