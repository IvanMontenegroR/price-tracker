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

## Las fuentes, después de descartar Best Buy

| Tienda | Estado | Por qué |
|---|---|---|
| **eBay** | Andando, fuente principal | Browse API oficial, gratis, sin exigencia de ventas previas. La única que trae subastas y usado. |
| **Amazon** | Registrada, sin implementar | Su contrato exige la Product Advertising API, y esa API exige cuenta de Associates aprobada **con ventas calificadas**. Lo desbloquea una cuenta, no una tarde de código. |
| B&H, Adorama, Newegg | Disponibles, sin listings | JSON-LD. Quedan por si hace falta comparar contra precio de lista nuevo. |
| Best Buy | Adaptador andando, tienda apagada | No lo sigo. Prenderla es una fila en `tracker.tienda`. |

### La subasta rompió un supuesto

Todas las tiendas de precio fijo comparten algo que eBay no: el precio de hoy
es el precio. En una subasta el número es una puja parcial que va a subir, y
sin cuidado cada subasta dispararía una alerta el día uno con la apertura de un
dólar. Sería la peor alerta del sistema: parece la oferta del año y no se puede
comprar. De ahí las tres reglas nuevas —ventana de 60 minutos para que cuente,
tier caliente 90 minutos antes del cierre, y una publicación cerrada no se lee
ni se muestra—.

## La función desplegada no es igual al archivo del repo

`supabase/functions/recolectar/index.ts` importa el motor con rutas relativas,
que es lo correcto cuando despliega la CLI desde el repo. La versión que está
corriendo hoy la desplegué por la API de gestión, y ahí los archivos van
sueltos: no hay `lib/` al lado. Así que esa versión importa el motor por HTTPS
desde `raw.githubusercontent.com`, **fijado al SHA del commit**, no a `main`.

Dos cosas que aprendí haciéndolo: el runtime no baja módulos remotos en
caliente —un `await import()` con la URL armada en una variable falla con
"Module not found"—, hay que dejar los imports estáticos para que se resuelvan
al empaquetar. Y en cuanto el workflow de GitHub corra con el access token,
redespliega desde la fuente y las dos versiones vuelven a ser la misma.

## Cosas que quedaron sin verificar

- **Los pesos de `data/productos.json` son estimaciones mías**, no medidas. Un
  peso mal cargado corre el precio puesto de todo el producto.
- **Los parámetros 7 US$/kg, 5 fijos y 15% son de arranque**, sin calibrar
  contra ninguna factura.
- **El adaptador de eBay no tocó nunca la API real.** El contenedor donde se
  construyó esto no tiene salida a internet hacia eBay. El mapeo de campos
  —`price` vs `currentBidPrice`, `estimatedAvailabilities`, `itemEndDate`—
  está probado contra respuestas de muestra escritas a mano, no capturadas. La
  primera lectura real es la que lo confirma. Lo mismo vale para el JSON-LD de
  B&H, Adorama y Newegg.
- **`npm:web-push` en Deno.** El envío de push usa la librería de Node por
  compatibilidad del runtime de Supabase. Es lo primero a mirar en el primer
  despliegue; si falla, hay que escribir la firma VAPID con Web Crypto.
- **El envío en EE.UU. casi nunca viene en el JSON-LD.** Hoy queda en `null` y
  suma 0 al puesto. Si el courier no es el que factura ese tramo, hay que
  cargarlo por tienda.
