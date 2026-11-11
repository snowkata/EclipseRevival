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

## Publicar en internet (Render, gratis)

El repositorio trae `render.yaml`, así que Render lo configura casi todo solo. Un único servidor entrega la página del juego, la API de cuentas y las salas en tiempo real.

1. Crea una cuenta en [render.com](https://render.com) entrando con GitHub y dale acceso al repositorio `EclipseRevival`.
2. En el panel: **New > Blueprint**, elige el repositorio y pulsa **Apply**. Render lee `render.yaml` y crea el servicio `eclipse-revival` (plan Free). `JWT_SECRET` se genera sola.
3. Te pedirá el valor de **DATABASE_URL**: en Supabase abre **Connect > Session pooler** y copia la cadena, cambiando `[YOUR-PASSWORD]` por la contraseña de la base. Usa el *pooler*: la conexión directa no funciona desde Render.
4. Sube el certificado: en Supabase **Database > Settings > SSL Configuration > Download certificate**; en Render abre el servicio > **Environment > Secret Files > Add**, nombre `prod-ca-2021.crt` y pega el contenido del archivo.
5. Espera a que termine el despliegue. En **Logs** debe salir `Base de datos: conectada`. El juego queda en `https://eclipse-revival.onrender.com` (o el nombre que te asigne).

Cada vez que se sube algo a `main`, Render vuelve a desplegar solo. En el plan gratis el servidor se duerme tras 15 minutos sin visitas y tarda cerca de un minuto en despertar; las salas abiertas se pierden al dormirse o al desplegar.

## Seguridad

- Contraseñas con bcrypt y sesiones JWT de 24 h firmadas con `JWT_SECRET` (HS256). En producción el servidor no arranca si la clave tiene menos de 32 caracteres.
- Los secretos (`DATABASE_URL`, `JWT_SECRET`, certificado) solo viven en `.env` o en el panel del hosting; `.env` y `*.crt` están en `.gitignore`.
- El servidor se conecta a Supabase directo por PostgreSQL con conexión cifrada y verificada. No usa la clave `anon` ni la `service_role`, y el navegador nunca habla con Supabase. Las tablas tienen RLS activado sin políticas, así que la API pública de Supabase no puede leerlas.
- Todo lo que llega por el socket se valida (tipos, tamaños, rangos) y un mensaje malformado ya no puede tumbar el servidor. Mensajes de más de 16 KB se rechazan.
- Límites: 80 mensajes por segundo por conexión (desconecta si pasa de 400), 10 conexiones por IP, 5 salas creadas por minuto por IP, 15 códigos de sala incorrectos por minuto por IP (frena a quien intenta adivinarlos), 100 salas a la vez, 20 intentos de inicio de sesión cada 5 min y 120 consultas a la API por minuto por IP.
- Los códigos de sala tienen 6 caracteres de un alfabeto de 32 (más de mil millones de combinaciones) y se generan con `crypto.randomBytes`. Para volver a una sala tras desconectarse se usa un token secreto de 96 bits, no el código.
- Cabeceras de seguridad en todas las respuestas (Content-Security-Policy, X-Frame-Options, nosniff, HSTS en producción). Por defecto solo se aceptan conexiones desde la propia página (sin CORS abierto).
- El servidor es autoritativo: daño, experiencia, oro y desbloqueos se calculan en el servidor. El movimiento que manda el navegador tiene un presupuesto que solo crece con el tiempo de partida, así que mandar muchos mensajes no permite ir más rápido.
- Todas las consultas SQL usan parámetros (`$1`, `$2`…), nunca texto pegado, así que no hay inyección SQL. Los nombres de jugadores se escapan antes de mostrarse y la política CSP bloquea scripts ajenos.
- Una cuenta solo puede estar en una sala a la vez, y una cuenta desactivada no puede comprar ni editar su perfil aunque conserve una sesión.
- Dependencias sin vulnerabilidades conocidas (`npm audit`).

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
- 5 eventos especiales: Eclipse total, Lluvia de meteoros, Cazador de recompensa, Cofre maldito y Escolta. Los tres últimos tienen un objetivo y solo dan recompensa si se cumple.
- Gemas de experiencia compartidas, objetos (oro, botiquín, imán, bomba, cofre) y pantalla de resultados.

El arte es provisional: se dibuja con código mientras se diseñan los sprites.

## Pendiente

- Leer los valores de armas, enemigos y mapas desde la base de datos, y el panel de administración.
- Peligros de cada mapa y los 3 mapas restantes.
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
