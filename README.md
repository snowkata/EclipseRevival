# Eclipse Revival

Videojuego web cooperativo de supervivencia por rondas (1 a 4 jugadores). Las armas atacan solas, los enemigos llegan en hordas y el equipo debe aguantar hasta derrotar al jefe final.

## Cómo ejecutarlo

Requiere Node.js 22 o superior.

```bash
npm install
npm run dev        # servidor en :3000 y cliente en http://localhost:5173
```

Para probar el multijugador abre el juego en dos pestañas: en una crea la sala y en la otra únete con el código (o con el enlace `?sala=CODIGO`).

Otros comandos:

```bash
npm run build      # compila cliente (dist/client) y servidor (dist/server.js)
npm start          # sirve el juego compilado en http://localhost:3000
npm test           # pruebas de la simulación
npm run typecheck
```

## Base de datos y cuentas

Sin base de datos el juego funciona en **modo invitado** (todo desbloqueado, nada se guarda). Para tener cuentas, progreso y clasificación:

1. Crea las tablas: en Supabase abre **SQL Editor**, pega el contenido de `db/eclipse_revival.sql` y pulsa **Run**.
2. Copia `.env.example` como `.env` y llena `DATABASE_URL`, `DATABASE_CA_FILE` y `JWT_SECRET` (el archivo explica dónde encontrar cada dato).
3. Arranca el servidor. Al iniciar muestra `Base de datos: conectada`.

Con cuentas activas:

- Registro e inicio de sesión (contraseñas con bcrypt, sesión de 24 h). También se puede jugar como invitado, sin guardar progreso.
- Cada partida terminada se guarda con sus rondas, elecciones de nivel y estadísticas por arma.
- Al terminar se gana experiencia de cuenta y oro. El oro se gasta en el **Taller** en mejoras permanentes.
- Personajes y armas se desbloquean con el nivel de cuenta; el siguiente mapa al completar el anterior y el modo Difícil al completar Normal. En una sala manda el progreso del anfitrión.
- Clasificación por mapa y dificultad, e historial de partidas.

Las pruebas de `tests/db.test.ts` solo corren si existe `DATABASE_URL`; úsalas con una base de pruebas, no con la real.

## Controles

- Mover: `WASD`, flechas o stick izquierdo del mando.
- Elegir mejora al subir de nivel: teclas `1`, `2`, `3` o clic.
- Pantalla completa: `F`.
- Revivir a un compañero caído: quedarse junto a él 3 segundos.

## Qué incluye esta primera versión

- Salas con código de 6 caracteres y enlace de invitación, lobby con personaje, "listo" e inicio por el anfitrión (máximo 4 jugadores) y reconexión durante 60 s.
- Servidor autoritativo: enemigos, daño, experiencia y oro se calculan en el servidor; el navegador solo dibuja y manda su posición, que el servidor valida.
- 4 personajes, 6 armas (proyectil, órbita, aura, rayo y área), 4 evoluciones, 8 pasivas, combos elementales entre jugadores.
- Rondas de 60 s, tres dificultades (10, 15 y 20 rondas), jefe cada 5 rondas y jefe final.
- 2 mapas jugables (Bosque Marchito y Ciudad en Ruinas); los otros 3 aparecen como "próximamente".
- 2 eventos especiales: Eclipse total y Lluvia de meteoros.
- Gemas de experiencia compartidas, objetos (oro, botiquín, imán, bomba, cofre) y pantalla de resultados.

El arte es provisional: se dibuja con código mientras se diseñan los sprites.

## Pendiente

- Leer los valores de armas, enemigos y mapas desde la base de datos, y el panel de administración.
- Eventos Cazador de recompensa, Cofre maldito y Escolta; peligros de cada mapa; los 3 mapas restantes.
- Arte, sonido y música definitivos.

## Estructura

```
src/shared/   datos del juego, fórmulas y mensajes (los usan cliente y servidor)
src/server/   Node.js + Socket.IO: salas (rooms.ts), simulación (game.ts), cuentas (accounts.ts) y guardado (persist.ts)
db/           script SQL de la base de datos
src/client/   Phaser 3 + interfaz HTML (menú, lobby, HUD)
tests/        pruebas de la simulación
```

Los valores de armas, enemigos, mapas y dificultades están en `src/shared/data.ts` y son los mismos del script SQL del modelo de datos. Dos ajustes propios de esta versión: la fórmula de cantidad de enemigos se aplica a cada oleada (una cada 6 s) y los enemigos se mueven al 60 % de su velocidad base.
