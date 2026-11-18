# Párame la mano

Ruta pública: `/juegos/parame-la-mano`, con invitación en `/juegos/parame-la-mano/CODIGO`. No requiere cuenta escolar ni aparece en los menús académicos. Se admiten de 2 a 12 invitados por sala; basta un nombre distinto y el código o enlace.

## Flujo

1. Una persona crea la sala, comparte el enlace y ajusta categorías, rondas y puntos antes de empezar. Por defecto: Nombre, Apellido, Animal, Color, País, Ciudad, Fruta y Cosa u objeto; cinco rondas; única 10, repetida 5, inválida o vacía 0.
2. El servidor elige una letra sin repetir. Cada invitado escribe sus respuestas; las de los otros permanecen ocultas. Las respuestas se guardan automáticamente. Puede recargar y continuar desde el mismo navegador.
3. Quien completa todas las categorías con la letra hace STOP. La primera petición que acepta el servidor cierra la ronda para todos. Después del STOP no se aceptan cambios; se usan las respuestas confirmadas en el servidor hasta ese instante.
4. Todos revisan la tabla. Una palabra se acepta salvo que alguien pulse **Cuestionar**; las vacías o de otra letra ya valen cero. Solo aparecen votaciones para las palabras cuestionadas. Una misma palabra repetida en la misma categoría comparte votación. El cuestionamiento registra un voto contrario; cada invitado tiene un voto. Decide la mayoría absoluta del grupo; un empate al terminar los votos vale cero.
5. Todos pulsan **Todo revisado**. Si hay conflictos sin resolver, la ronda espera. Abrir otro conflicto reinicia las confirmaciones. Al terminar se calculan puntos por respuesta y clasificación acumulada. Quien organiza inicia la siguiente ronda; la última muestra quién gana o empata.

Se ignoran mayúsculas, espacios duplicados y tildes al comparar; Ñ se conserva distinta de N. Una palabra válida repetida obtiene los puntos de repetida para cada participante que la escribió; la única obtiene los puntos de única. El grupo decide el contenido de las respuestas: no se usa un diccionario automático ni IA.

## Reconexión y almacenamiento

Los invitados se identifican con un secreto aleatorio guardado localmente por sala. El servidor almacena únicamente su hash en `stop_game_guests`. Estos invitados no crean usuarios ni relaciones con instituciones. La sesión y las respuestas se recuperan desde PostgreSQL; las respuestas ajenas nunca se envían mientras se escribe.

La sincronización consulta la sala cada 1,5 segundos y guarda al dejar de escribir durante 250 ms. El servidor decide STOP, votos y puntuaciones, y serializa cambios con revisión optimista para admitir varias instancias de API. No se confía en puntos, identidad de votante ni estado enviados por el cliente.

Las salas duran 24 horas; al crear otra se eliminan las caducadas y sus accesos. Solo se incorporan nuevos jugadores antes del inicio. El organizador puede retirar jugadores en la sala de espera; durante la partida, únicamente tras un minuto sin conexión. Si quien organiza se desconecta durante un minuto, otro invitado puede asumir ese papel. Salir explícitamente transfiere la organización. Con menos de dos jugadores la partida termina.

## Publicación y verificación

Aplicar `20261118200000_stop_game` antes de desplegar la API. Solo añade `stop_game_rooms` y `stop_game_guests`; no altera tablas escolares existentes. El frontend carga el juego en una ruta pública independiente y en su propio módulo.

Pruebas: 13 de reglas y 5 HTTP con PostgreSQL, incluyendo invitados, concurrencia, STOP simultáneo, votación, privacidad, puntos únicos/repetidos, reconexión y caducidad. La prueba en navegador completa una partida de tres invitados independientes y verifica móvil. La suite general pasa 535 pruebas; 43 integraciones ajenas al juego se omiten por falta de sus bases de prueba específicas.

Las integraciones del juego solo aceptan `STOP_GAME_TEST_DATABASE_URL` en `127.0.0.1:55441/games_test`. La revisión de tipos de la API conserva el error previo de Actividades en `prisma-activity.repository.ts:98`.
