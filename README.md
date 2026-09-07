# Precio puesto

Tracker de precios personal. Vigila electrónica en tiendas de EE.UU. y avisa
cuando el **precio puesto en Asunción** —con envío, courier e impuesto— baja
del objetivo que puse.

No es un producto. Es una herramienta para mí solo.

## El único número que importa

```
puesto_py = precio + envio_us + (peso_kg × TARIFA_KG) + FEE_FIJO + precio × TASA_IMP
```

Un iPhone a US$ 999 en Best Buy, 0,45 kg, con 7 US$/kg, 5 fijos y 15%:

```
Etiqueta            US$ 999.00
Envío en EE.UU.     US$   0.00
Flete 0.45 kg × 7   US$   3.15
Fee fijo            US$   5.00
Impuesto 15%        US$ 149.85
─────────────────────────────
Puesto en Asunción  US$ 1156.65
```

La etiqueta de US$ 999 no sirve para decidir; US$ 1.156,65 sí. Por eso el número
nunca se muestra solo: cada alerta y cada fila de la lista llevan el desglose
completo, y **cada observación guarda los parámetros con los que se calculó**,
para poder recalcular el histórico cuando los cambie.

## Cómo está armado

```
lib/costo.ts            la fórmula, y nada más que la fórmula
lib/estadistica.ts      mediana y percentiles. No hay promedio, a propósito
lib/adaptadores/        una tienda = un archivo con la misma firma
lib/recolector/         presupuesto y tiers, circuit breaker, la corrida
lib/reglas/             R1 y el anti-ruido
lib/db/                 la misma interfaz contra Supabase o contra memoria
app/                    una pantalla: lo que sigo, con su desglose
supabase/functions/     el recolector, que es donde vive el cron
supabase/migrations/    el esquema con RLS y el pg_cron
```

### Dónde corre cada cosa

El sitio es **estático, en GitHub Pages**. No hay servidor propio, así que la
pantalla habla con la base directamente y **la RLS es la única autorización**.

El recolector no puede vivir ahí: necesita la `service_role`, la clave privada
de VAPID y la de Resend, y ninguna de las tres puede tocar el navegador. Corre
como **edge function de Supabase**, disparada por **pg_cron** cada cinco
minutos con un secreto en la cabecera guardado en Vault.

Que los disparos no sean exactos no importa. El planificador nunca asumió ticks
parejos: en cada corrida mira qué está vencido según su cadencia y cuánto
presupuesto queda. Un tick que llega tarde lee más cosas; uno que se pierde no
rompe nada.

### Las tres cosas separadas

- **producto** — "iPhone 17 Pro 256GB". Lleva el **peso en kg**: es lo único
  que no se lee de la tienda y sin lo cual no hay precio puesto.
- **listing** — ese producto en una tienda concreta: URL, vendedor, condición.
- **observación** — una lectura: (listing, ts, precio, envío, stock).

Separar producto de listing es lo que deja comparar entre tiendas, y comparar
entre tiendas es de donde va a salir la detección de errores de precio (R3) sin
necesitar historial.

### De dónde salen los precios

En este orden:

1. **eBay**, la fuente principal: Browse API oficial, y la única que trae
   **subastas y usado**, que es donde están los precios que valen la pena
   (`lib/adaptadores/ebay.ts`). No es tan abierta como parece: la cuenta de
   desarrollador se aprueba rápido, pero el keyset de producción tiene pasos
   extra y parte de las Buy APIs son de acceso restringido. El presupuesto por
   defecto de 2.000 peticiones diarias entra cómodo bajo el tope estándar de
   5.000 por día. Con `EBAY_ENV=sandbox` se puede validar el mapeo de campos
   antes de tener producción.
2. **Feeds de afiliados** (Awin, Impact). `lib/adaptadores/feed.ts` está
   escrito y probado, pero **no hay ninguna tienda usándolo**: hace falta
   cuenta de publisher aprobada.
3. **Scraping liviano** para lo que no tenga ninguna de las dos: un GET y el
   JSON-LD de schema.org que la tienda ya publica para Google Shopping
   (`lib/adaptadores/jsonld.ts`). B&H, Adorama, Newegg.
4. **Amazon: no hay vía.** Su contrato prohíbe el scraping y exige que el
   precio venga de su API. La Product Advertising API se retiró en mayo de
   2026, y la Creators API que la reemplaza exige cuenta de Associates
   aceptada **con ventas referidas sostenidas mes a mes**. Para un tracker
   personal eso no es un trámite pendiente, es un callejón sin salida: habría
   que mantener un sitio de afiliados vendiendo para poder mirar un precio. El
   adaptador queda documentando la decisión y tirando `NoImplementado`.

Best Buy tiene adaptador andando pero la tienda está apagada: no lo sigo.

### Lo que trajo eBay: la puja no es un precio

Una subasta a tres días no tiene precio, tiene una apuesta parcial que va a
subir. Sin cuidado, cada subasta dispararía una alerta el día uno con la puja
de apertura de un dólar: la peor alerta posible, porque parece la oferta del
año y no se puede comprar.

Por eso una subasta **solo cuenta como precio dentro de los 60 minutos previos
al cierre**, cuando todavía puedo pujar y el número ya se parece al final. Y al
revés: una subasta que cierra dentro de 90 minutos pasa a tier caliente valga
lo que valga, porque ahí el reloj manda sobre el precio. Una publicación
cerrada no se lee más ni aparece en la lista.

### Frecuencia: presupuesto, no intervalo

No hay "cada X minutos". Hay un techo de peticiones por día que se reparte por
prioridad:

```
prioridad = volatilidad × cercanía_al_umbral × evento × atraso
```

Tres tiers: **caliente** (5 min) para lo que está a menos del 5% de disparar,
**normal** (30 min), **frío** (1 vez al día). Si el presupuesto se agota, los
fríos dejan de chequearse y los calientes siguen: el sistema se auto-degrada y
nunca se pasa de costo.

El factor `atraso` no estaba en el diseño original y hubo que agregarlo: sin él,
con el presupuesto ajustado el listing de mayor score se lleva **todos** los
slots. En la primera corrida de un día, un solo producto se llevó 284 de 288
lecturas y los otros nueve quedaron invisibles.

### El anti-ruido es el producto

- Cooldown de 12 h por producto. R3 exento.
- Histéresis: tras avisar a X, no reabre hasta que baje otro 5% o hasta que
  vuelva por encima de la referencia y baje de nuevo.
- **Sin stock nunca alerta.** Precio bajo + agotado = ruido.
- Techo de 5 alertas por día. R3 exento.
- **Circuit breaker por tienda**: más del 30% de lecturas nulas o absurdas en
  una hora y el adaptador se apaga solo por una hora.

### Las reglas

Esta versión corre **solo R1**: `precio_puesto ≤ objetivo_que_yo_puse`.

R2 (estadística sobre 90 días) y R3 (error de precio contra el mercado de hoy)
están descritas en el diseño y no implementadas: necesitan historial y varias
tiendas confiables leyendo a la vez. Construirlas hoy sería construirlas sobre
datos que no existen. El esquema y el anti-ruido ya las contemplan.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # completar
npm run vapid                  # genera las claves de Web Push
npm run dev
```

En Supabase, el esquema vive en el schema `tracker` del proyecto. Para que la
app lo vea por PostgREST hay que tenerlo en **Settings → API → Exposed schemas**
(ya está agregado por configuración de rol, pero el panel es lo que lo hace
duradero).

Para desplegar:

1. **Pages** — Settings → Pages → Source: GitHub Actions. Los secrets del repo:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
2. **La URL del sitio** va en Supabase → Authentication → URL Configuration,
   como Site URL y como redirect: `https://<usuario>.github.io/price-tracker/`.
   Sin eso el magic link no vuelve.
3. **La función** — secrets del repo `SUPABASE_ACCESS_TOKEN` y
   `SUPABASE_PROJECT_REF`; el workflow la despliega en cada push que toque
   `lib/` o `supabase/functions/`. Sus variables van con
   `supabase secrets set` (ver `.env.example`).
4. **Prender el cron**, que arranca apagado para no pegarle a una función que
   todavía no existe:

   ```sql
   select cron.alter_job((select jobid from cron.job where jobname='recolectar'), active := true);
   ```

```bash
npx tsx scripts/sembrar.ts <usuario_id>   # tiendas, parámetros y 10 productos
npx tsx scripts/recolectar.ts             # una corrida contra la base
npx tsx scripts/simular.ts --ticks 288    # un día entero sin red y sin base
npm test                                  # 52 pruebas
```

## Lo que falta

- Pegarle a cada producto su URL real de tienda: los listings sembrados apuntan
  al adaptador de fixtures.
- Calibrar `TARIFA_KG`, `FEE_FIJO` y `TASA_IMP` contra facturas reales del
  courier. Los valores de arranque (7 / 5 / 15%) son una estimación.
- Verificar los pesos contra la etiqueta real: un peso mal cargado corre el
  precio puesto de todo el producto.
- Cuenta de Awin o Impact para pasar de scraping a feeds.
