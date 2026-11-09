# Eclipse Revival

Videojuego web cooperativo de supervivencia por rondas (1 a 4 jugadores). Las armas atacan solas, los enemigos llegan en hordas y el equipo debe aguantar hasta derrotar al jefe final.

## Cómo ejecutarlo

Requiere Node.js 20 o superior.

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

- Cuentas, guardado de partidas, clasificación y progresión permanente en PostgreSQL (Supabase).
- Eventos Cazador de recompensa, Cofre maldito y Escolta; peligros de cada mapa; los 3 mapas restantes.
- Arte, sonido y música definitivos. Panel de administración.

## Estructura

```
src/shared/   datos del juego, fórmulas y mensajes (los usan cliente y servidor)
src/server/   Node.js + Socket.IO: salas (rooms.ts) y simulación (game.ts)
src/client/   Phaser 3 + interfaz HTML (menú, lobby, HUD)
tests/        pruebas de la simulación
```

Los valores de armas, enemigos, mapas y dificultades están en `src/shared/data.ts` y son los mismos del script SQL del modelo de datos. Dos ajustes propios de esta versión: la fórmula de cantidad de enemigos se aplica a cada oleada (una cada 6 s) y los enemigos se mueven al 60 % de su velocidad base.
