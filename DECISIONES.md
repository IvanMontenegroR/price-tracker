# Decisiones y hallazgos

Lo que se decidió al construir la primera versión, y lo que la corrida de un día
mostró que estaba mal en el diseño.

## Decisiones tomadas (07/09/2026)

| Tema | Decisión |
|---|---|
| Repo | Proyecto propio, separado del juego de Olimpia. |
| Hosting | GitHub Pages para la pantalla (export estático) y edge function de Supabase para el recolector, disparada por pg_cron. Sin Vercel: el sitio no necesita servidor y lo que sí lo necesita ya tiene uno. |
| Supabase | Schema `tracker` dentro del proyecto **Forge** que ya existe, en vez de un proyecto nuevo: el plan free topa en dos proyectos activos y un schema aparte aísla igual. |
| Fuentes | Sin cuenta de afiliado aprobada: se arranca con API oficial de Best Buy y JSON-LD para B&H, Adorama y Newegg. El adaptador de feeds queda escrito y probado, esperando la cuenta. |
| Avisos | Email (Resend) **y** Web Push desde el día uno. El push es el rápido; el mail es el que llega igual cuando iOS desinstala la PWA o vence la suscripción. |
| Auth | Magic link de Supabase. Un solo usuario, pero con RLS de verdad: la app se conecta con mi sesión, y solo el cron usa service role. |
| Parámetros de costo | Se versionan, no se pisan. Cada observación guarda tarifa, fee, tasa y peso congelados. |
| `puesto_py` | Columna generada en Postgres, no calculada por la app: así ninguna fila puede quedar con un puesto que no se corresponde con sus insumos. |
| Reglas | Solo R1. R2 y R3 quedan diseñadas en el esquema y en el anti-ruido, sin implementar. |

## Correcciones al diseño, encontradas corriendo el sistema

1. **El score por sí solo mata de hambre a casi todo.**
   El diseño decía `score = volatilidad × cercanía × evento`. En la primera
   corrida de un día con presupuesto ajustado, el listing de mayor score se
   llevó **284 de 288 lecturas** y los otros nueve productos quedaron sin una
   sola observación. Se agregó el factor **atraso** (cuántas cadencias pasaron
   desde la última lectura), sin tope: el que espera crece sin límite y el que
   se acaba de leer vuelve a 1. El score sigue decidiendo cuántas veces le toca
   a cada uno, pero a todos les llega el turno.

2. **El sello de tiempo de la observación es el del recolector, no el de la
   fuente.** Un feed puede traer el precio de anoche. Lo que ordena el historial
   y define la frescura es cuándo lo leí yo; el `ts` de la fuente queda en
   `crudo`.

3. **Una lectura fallida es un dato, no un descarte.** Se guarda con
   `estado = 'nula'`. Es lo único que alimenta el circuit breaker: si se
   descartan, un adaptador roto parece un día sin ofertas.

4. **El umbral de "absurdo" tiene que ser bajísimo.** Se descarta lo que no
   puede ser cierto (cero, negativo, 20× o 1/50 de la mediana). Un 60% de
   descuento **no** es absurdo: es exactamente lo que R3 tiene que poder ver.

## Lo que costó el cambio a Pages

Pasar la pantalla a estático sacó toda la capa de servidor: server actions,
rutas `/api` y el middleware de sesión. Las escrituras van ahora del navegador
a la base, y **la RLS pasó de ser una red de seguridad a ser la única
autorización que existe**. El motor de `lib/` no se tocó: lo mismo que corría
en la ruta de Vercel corre ahora en Deno.

Dos cosas que eso obligó:

- `process.env` no existe en Deno ni en el navegador. Se centralizó en
  `lib/entorno.ts`, que resuelve `Deno.env`, `process.env` o nada.
- Deno exige extensión en los imports relativos, así que todo `lib/` importa
  con `.ts`. El bundler de Next resuelve el archivo exacto sin quejarse.

## Cosas que quedaron sin verificar

- **Los pesos de `data/productos.json` son estimaciones mías**, no medidas. Un
  peso mal cargado corre el precio puesto de todo el producto.
- **Los parámetros 7 US$/kg, 5 fijos y 15% son de arranque**, sin calibrar
  contra ninguna factura.
- **Los adaptadores reales no se probaron contra las tiendas**: el contenedor
  donde se construyó esto no tiene salida a internet hacia Best Buy, B&H,
  Adorama ni Newegg. El parseo está probado con HTML de muestra; la primera
  corrida real va a decir qué tienda cambió el formato.
- **`npm:web-push` en Deno.** El envío de push usa la librería de Node por
  compatibilidad del runtime de Supabase. Es lo primero a mirar en el primer
  despliegue; si falla, hay que escribir la firma VAPID con Web Crypto.
- **El envío en EE.UU. casi nunca viene en el JSON-LD.** Hoy queda en `null` y
  suma 0 al puesto. Si el courier no es el que factura ese tramo, hay que
  cargarlo por tienda.
