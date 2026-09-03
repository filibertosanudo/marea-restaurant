# Marea — arquitectura de la base de datos

Documento acompañante de `prisma/schema.prisma`.
Tres partes: **cómo se relacionan los modelos**, **por qué se separaron ciertas
entidades** (leído desde Laravel/Eloquent) y **qué sembrar** para probarlo.

---

## 1. Mapa de modelos

### 1.1 El centro: `Business`

Todo cuelga de `Business`. En la v1 hay **una sola fila** (`slug = "marea"`) y
puedes resolverla una vez al inicio de cada request. La columna `businessId`
está en cada tabla de datos operativos no porque hoy la necesites, sino porque
agregarla después sobre tablas con millones de pedidos es una migración
dolorosa, y ponerla hoy es gratis.

```
Business ─┬─ BusinessTranslation      (tagline, "sobre nosotros", SEO por idioma)
          ├─ OpeningHour / BusinessClosure   (horario y excepciones)
          ├─ BusinessMembership ── User      (quién trabaja aquí y con qué rol)
          ├─ MenuCategory ── MenuItem        (catálogo)
          ├─ ModifierGroup ── ModifierOption (variantes reutilizables)
          ├─ Tag                             (etiquetas del catálogo)
          ├─ RestaurantTable                 (mesas + QR)
          ├─ Cart ── CartItem                (carrito vivo)
          ├─ Order ── OrderItem              (pedidos históricos)
          ├─ Payment ── Refund               (cobros)
          ├─ Reservation                     (reservaciones)
          ├─ Promotion                       (ofertas)
          ├─ Testimonial                     (reseñas)
          ├─ NotificationJob                 (cola de avisos)
          └─ NewsletterSubscriber
```

### 1.2 Autenticación y roles

`User` es el modelo de Auth.js, con tres compañeros obligatorios del adaptador
(`Account`, `Session`, `VerificationToken`) cuyos nombres de campo en
`snake_case` **no debes tocar**: los lee la librería.

El rol vive en dos lugares con una jerarquía clara:

| Nivel | Dónde | Para qué |
|---|---|---|
| Plataforma | `User.role` | El middleware de la v1. `SUPER_ADMIN` sólo existe aquí. |
| Negocio | `BusinessMembership.role` | El rol real cuando haya varios negocios. |

Regla de resolución: `SUPER_ADMIN` en `User.role` gana siempre; si no, se usa
el `role` del `BusinessMembership` del negocio activo; si no hay membresía, el
usuario es `CUSTOMER`. En la v1 creas una membresía por empleado y la regla se
cumple sola.

### 1.3 Catálogo e i18n

```
MenuCategory 1─n MenuItem
MenuCategory 1─n MenuCategoryTranslation   @@unique([categoryId, locale])
MenuItem     1─n MenuItemTranslation       @@unique([menuItemId, locale])
MenuItem     n─n Tag              vía MenuItemTag
MenuItem     n─n ModifierGroup    vía MenuItemModifierGroup
ModifierGroup 1─n ModifierOption  1─n ModifierOptionTranslation
```

El patrón i18n es siempre el mismo: **la fila padre guarda lo que no cambia con
el idioma** (precio, foto, disponibilidad, orden) y **una tabla hija guarda lo
que sí** (nombre, descripción, texto alternativo de la imagen). La restricción
`@@unique([parentId, locale])` garantiza que no puedas tener dos nombres en
español para el mismo platillo.

Consulta típica del menú público:

```ts
const menu = await prisma.menuCategory.findMany({
  where: { businessId, isActive: true, deletedAt: null },
  orderBy: { sortOrder: "asc" },
  include: {
    translations: { where: { locale } },
    items: {
      where: { isAvailable: true, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      include: { translations: { where: { locale } }, tags: { include: { tag: true } } },
    },
  },
});
```

Un solo round-trip, y el índice `[businessId, categoryId, isAvailable, sortOrder]`
lo resuelve sin escanear la tabla.

**Modificadores**: el precio de una opción es un **delta**, no un precio
absoluto. "Grande +$6" sirve igual para una bebida de $8 que para una de $12.
El precio final de una línea es `basePrice + Σ priceDelta`, y ese resultado es
el que se congela en `OrderItem.unitPrice`.

### 1.4 Mesas y QR

`RestaurantTable.qrToken` es un valor **separado del `id`**. La URL del QR es
`/t/<qrToken>`, no `/t/<id>`. Eso te deja rotar el token (`qrRotatedAt`) cuando
alguien fotografía el código de la mesa 4 y se pone a ordenar desde su casa,
sin perder ni un pedido del historial de esa mesa.

### 1.5 Carrito → pedido

```
Cart ── CartItem ── CartItemModifier      (precios VIVOS)
   │  (checkout: se copian y congelan)
   ▼
Order ── OrderItem ── OrderItemModifier   (precios CONGELADOS)
     └── OrderStatusEvent
     └── Payment ── Refund
     └── OrderPromotion
```

La conversión de carrito a pedido es el único momento en que los precios se
copian. Antes de eso, si el negocio sube el precio, el cliente ve el precio
nuevo (correcto). Después, el ticket es inmutable.

### 1.6 Estados en tiempo real

`Order.status` es la foto actual; `OrderStatusEvent` es la película. Cada
transición inserta una fila con `fromStatus`, `toStatus`, `changedById` y
`createdAt`. Esto te da tres cosas gratis:

1. **Métricas reales** — cuánto tarda cocina de `PENDING` a `READY`.
2. **Trazabilidad** — quién canceló el pedido y a qué hora.
3. **Realtime limpio** — Supabase Realtime escucha `INSERT` sobre una tabla
   append-only, que es mucho más fácil de razonar que `UPDATE` sobre `Order`.

Regla de oro: cambiar estado y encolar la notificación **en la misma
transacción**.

```ts
await prisma.$transaction(async (tx) => {
  const order = await tx.order.update({
    where: { id },
    data: { status: "READY", readyAt: new Date() },
  });
  await tx.orderStatusEvent.create({
    data: { orderId: id, fromStatus: "PREPARING", toStatus: "READY", changedById: staffId },
  });
  await tx.notificationJob.create({
    data: {
      businessId: order.businessId,
      channel: "EMAIL",
      templateKey: "order.ready",
      recipientEmail: order.guestEmail,
      relatedOrderId: order.id,
      dedupeKey: `order:${order.id}:READY`,   // idempotencia
      payload: { orderNumber: order.orderNumber },
    },
  });
});
```

Si la transacción falla, no se manda un correo de algo que no pasó. Es el
patrón *transactional outbox*.

### 1.7 Reservaciones

El campo clave es `endsAt`, **guardado** y no calculado. La pregunta que hace
el módulo mil veces al día es "¿esta mesa está libre entre A y B?", y sólo es
indexable si ambos extremos son columnas reales:

```ts
const choques = await prisma.reservation.count({
  where: {
    tableId,
    status: { in: ["PENDING", "CONFIRMED", "SEATED"] },
    reservedFor: { lt: fin },
    endsAt: { gt: inicio },
  },
});
```

El índice `[tableId, reservedFor, endsAt]` sirve exactamente esa consulta.

Ese `count` **no es suficiente** bajo concurrencia: dos personas pueden
reservar el mismo segundo y ambas ver `0`. Para cerrarlo de verdad hace falta
una `EXCLUDE` constraint de Postgres, que Prisma no genera. El SQL está escrito
como comentario al final del modelo `Reservation`; agrégalo a mano dentro de la
migración generada.

### 1.8 Pagos

`Order 1─n Payment` (no `1─1`) porque en la vida real hay intentos fallidos,
cuentas divididas y anticipos. `Payment 1─n Refund` porque los reembolsos son
parciales y múltiples.

`StripeWebhookEvent` es tu seguro contra el doble cobro: Stripe reenvía el
mismo evento cuando tu endpoint tarda o falla. Inserta `eventId` (único) en la
misma transacción que aplica el efecto; si el insert choca, ya lo procesaste.

### 1.9 Promociones

Cuatro promociones del landing, cuatro formas del mismo modelo:

| Oferta | `type` | `value` | Otros campos |
|---|---|---|---|
| Champagne & Oysters Set | `BUNDLE_PRICE` | `39.00` | `PromotionMenuItem` → ostras |
| Lobster Night (jueves) | `PERCENTAGE` | `50.00` | `daysOfWeek: [4]`, `appliesToOrderType: DINE_IN` |
| Seafood Lovers' Platter | `BUNDLE_PRICE` | `59.00` | 2 platillos ligados |
| Sushi Weekend (vie–dom) | `PERCENTAGE` | `20.00` | `daysOfWeek: [5,6,0]` |

Nota la separación entre `value` (el número con el que se calcula) y
`PromotionTranslation.badgeLabel` (el texto de mercadotecnia: "50% OFF" /
"50% DESC.", "$59 (for 2)"). Si mezclas los dos en una columna, el día que
quieras cambiar "50% OFF" por "¡Mitad de precio!" vas a romper el cálculo.

`OrderPromotion` guarda el descuento aplicado a cada pedido con su monto
congelado — sin eso, un ticket viejo no cuadra y no sabes por qué.

### 1.10 Cola de notificaciones

`NotificationJob` es una cola en Postgres, sin Redis. El worker toma trabajo con:

```sql
SELECT * FROM "NotificationJob"
WHERE status = 'QUEUED' AND "runAfter" <= now()
ORDER BY "runAfter"
LIMIT 20
FOR UPDATE SKIP LOCKED;
```

`SKIP LOCKED` deja correr varios workers sin que se pisen. El índice
`[status, runAfter]` es el que sirve esa consulta. `attempts` + `runAfter`
implementan el backoff exponencial; `dedupeKey` (único) evita el doble envío
por doble clic.

### 1.11 IA (v2, comentado en el schema)

Sí hacen falta tablas, y son tres:

- **`AiConversation` / `AiMessage`** — el hilo, para dar contexto entre turnos,
  moderar, y medir costo (`promptTokens`, `completionTokens`). El valor
  secundario es enorme: saber que 200 personas preguntaron "¿tienen opciones
  sin gluten?" es información de producto, no un log.
- **`AiKnowledgeChunk`** — fragmentos del menú, horarios y políticas ya
  embebidos, para RAG. Requiere `CREATE EXTENSION vector;` en Supabase; Prisma
  no tiene tipo `vector`, así que la columna va como
  `Unsupported("vector(1536)")` y se consulta con `$queryRaw`.

Están comentadas al final de `schema.prisma` para no ensuciar la primera
migración. Descoméntalas el día que las vayas a construir.

---

## 2. Si vienes de Laravel/Eloquent

### 2.1 Traducción mental rápida

| Laravel / Eloquent | Prisma |
|---|---|
| Migración + modelo, dos archivos | `schema.prisma`, un solo archivo, y la migración se genera |
| `php artisan migrate` | `npx prisma migrate dev` |
| `$table->foreignId('order_id')` | `orderId String` + bloque `@relation` |
| `hasMany` / `belongsTo` declarados en el modelo | Se declaran **en los dos lados** del schema, o Prisma no compila |
| `with('items')` (eager loading) | `include: { items: true }` |
| `Order::find(1)` | `prisma.order.findUnique({ where: { id } })` |
| `$order->items` (lazy loading) | **No existe.** Si no lo pediste en el `include`, no está. |
| Scopes (`->active()`) | Funciones normales que devuelven objetos `where` |
| Casts (`'total' => 'decimal:2'`) | El tipo está en el schema; llega como `Prisma.Decimal` |
| `SoftDeletes` trait | No hay trait: `deletedAt DateTime?` + tú filtras (o usas una extensión de cliente) |
| Seeders + Factories | `prisma/seed.ts`, un script normal de TypeScript |

Tres cosas que sorprenden viniendo de Eloquent:

1. **No hay lazy loading.** Es a propósito: mata el problema N+1 en la puerta.
   Si `order.items` es `undefined`, es porque no lo incluiste.
2. **No hay modelos.** Prisma devuelve objetos planos, no instancias con
   métodos. Tu lógica de negocio vive en funciones de `lib/`, no en el modelo.
   Se siente pobre al principio y se agradece a los seis meses.
3. **El soft delete no es automático.** `deletedAt` es una columna como
   cualquier otra: si se te olvida el `deletedAt: null`, ves los borrados.
   Centraliza tus queries de catálogo en `lib/menu.ts` en vez de repartir
   `where` por toda la app.

### 2.2 ¿Por qué `Order` y `OrderItem` son tablas distintas?

Es la pregunta correcta, y la respuesta es la misma que en Laravel — sólo que
aquí importa más porque hay dinero de por medio.

**Un pedido tiene N platillos.** Un solo registro no puede guardar "2 langostas
y 1 papas" sin meter un JSON o columnas `platillo1`, `platillo2`… Ambas
opciones te dejan sin poder responder "¿cuántas langostas vendimos en julio?"
con un `GROUP BY`. Con `OrderItem` es una línea de SQL.

**Cada línea tiene sus propios datos**: cantidad, precio congelado, notas
("sin cebolla"), y sus propios modificadores. Todo eso son atributos de la
línea, no del pedido.

**Y sobre todo: el snapshot.** Este es el punto que pediste explícitamente y
merece detenerse.

Lo intuitivo sería que `OrderItem` guarde sólo `menuItemId` y que al mostrar el
ticket hagas el join para leer el precio actual. Eso funciona **hasta el día
que subes un precio**:

```
1 de julio:  cliente pide Langosta Thermidor.  Catálogo dice $42.  Cobras $42.
1 de agosto: subes la langosta a $55.
2 de agosto: abres el ticket de julio…  y dice $55.
```

Tu reporte de ventas de julio acaba de cambiar solo. El cliente que pide su
factura ve un número que nunca pagó. Y si tuviste una promoción, ni siquiera
sabes por qué el total no cuadra con la suma de las líneas.

Por eso `OrderItem` guarda **`nameSnapshot` y `unitPrice` copiados**, y
`menuItemId` queda como referencia informativa (con `onDelete: SetNull`, para
que la línea sobreviva aunque el platillo desaparezca). La misma lógica aplica
a `OrderItemModifier`, a los totales de `Order` y a `OrderPromotion`.

Regla general: **el catálogo es el presente, el pedido es el pasado.** Un
registro histórico nunca debe depender de una tabla que sigue cambiando.

### 2.3 Otras separaciones que parecen exageradas y no lo son

| Separación | Por qué |
|---|---|
| `Order.status` **+** `OrderStatusEvent` | La columna responde "¿cómo va?" en O(1); la tabla responde "¿cuánto tardó y quién lo movió?". Dos preguntas distintas. |
| `Cart` aparte de `Order` | Un carrito caduca y se borra; un pedido no se borra nunca. Además el carrito existe sin usuario (invitado) y sin totales cerrados. Un `Order` en estado `DRAFT` ensuciaría todos tus reportes. |
| `Payment` aparte de `Order` | Intentos fallidos, cuenta dividida, anticipo + resto. Columnas `stripe_*` en `Order` sólo aguantan el caso feliz. |
| `MenuItemTranslation` aparte de `MenuItem` | Agregar portugués es un `INSERT`, no un `ALTER TABLE`. Y puedes preguntar "¿qué platillos no tienen traducción al inglés?" con un `LEFT JOIN`. |
| `ModifierGroup` a nivel negocio, ligado por pivote | "Extras de queso" aplica a 20 platillos. Duplicarlo 20 veces significa 20 lugares que actualizar cuando suba el precio del queso. |
| `Tag` con tabla propia en vez de `String[]` | Las etiquetas necesitan traducción, color e icono, y quieres filtrar por ellas con índice. |

### 2.4 Por qué `cuid()` y no `autoincrement()`

Con IDs autoincrementales, dos negocios que nacieron por separado tienen ambos
un `Order 1`. El día que quieras consolidarlos —o simplemente mover un tenant
de una base a otra— tienes que reasignar llaves y reescribir cada llave
foránea. Con `cuid()` los IDs ya son globalmente únicos y el merge es un
`INSERT`. Además puedes generar el ID en el cliente antes de tocar la base
(útil para UI optimista) y no filtras cuántos pedidos lleva el negocio en la
URL.

### 2.5 Por qué `Decimal` y nunca `Float`

`0.1 + 0.2 !== 0.3` en punto flotante. En dinero eso son centavos que
desaparecen y cortes de caja que no cuadran. `Decimal(10,2)` es exacto.

El costo: en TypeScript llega como `Prisma.Decimal`, no como `number`. No
puedes hacer `a + b`; usa `a.add(b)`, `a.mul(qty)`, `a.toDecimalPlaces(2)`.
Y para hablar con **Stripe conviértelo a centavos enteros**, porque Stripe
siempre trabaja en la unidad mínima de la moneda:

```ts
const amountInCents = order.total.mul(100).toNumber();
```

---

## 3. Índices: qué consulta resuelve cada uno

| Índice | Consulta que sirve |
|---|---|
| `MenuItem [businessId, categoryId, isAvailable, sortOrder]` | El menú público por categoría |
| `MenuItemTranslation [locale, name]` | Buscador de platillos por nombre |
| `Order [businessId, status, placedAt]` | Tablero de cocina |
| `Order [tableId, status]` | "¿Qué se está preparando para la mesa 4?" |
| `Order [customerId, placedAt]` | "Mis pedidos" |
| `Reservation [tableId, reservedFor, endsAt]` | Disponibilidad de mesa en un rango |
| `Reservation [businessId, status, reservedFor]` | Agenda del día en el panel |
| `NotificationJob [status, runAfter]` | El poller del worker |
| `Payment [businessId, status, createdAt]` | Corte de caja / conciliación |
| `Promotion [businessId, isActive, startsAt, endsAt]` | Ofertas vigentes hoy |

`@@unique` que además son reglas de negocio: `[businessId, slug]` en catálogo,
`[businessId, orderNumber]` (folio por negocio, no global),
`[businessId, code]` en mesas, `[parentId, locale]` en cada traducción,
`stripePaymentIntentId` y `StripeWebhookEvent.eventId` para idempotencia.

---

## 4. Puesta en marcha

```bash
npm i prisma @prisma/client
npm i -D tsx dotenv
npx prisma migrate dev --name init
npx prisma db seed
npx prisma studio            # inspector visual, muy útil viniendo de phpMyAdmin
```

Detalles de Supabase que muerden:

- **Dos URLs.** `DATABASE_URL` apunta al pooler (`:6543`, con
  `?pgbouncer=true`) para la app; `DIRECT_URL` apunta a la conexión directa
  (`:5432`) para migraciones y seed. `prisma migrate` **no** funciona a través
  de pgbouncer en modo transaction.
- **RLS.** Supabase la trae encendida por defecto en tablas creadas desde su
  UI, pero **no** en tablas creadas por Prisma Migrate. Si vas a exponer la
  base al cliente con la anon key, tienes que escribir las políticas a mano.
  Mientras todo pase por route handlers de Next.js con la service key, no es
  urgente — pero es exactamente el momento en que `businessId` deja de ser
  decorativo.

---

## 5. Qué sembrar (`prisma/seed.ts`)

El seed que acompaña este documento ya trae todo lo de abajo, tomado tal cual
de `components/marea-landing/content.ts`. Corre `npx prisma db seed` y tienes
el landing completo en base de datos.

**1. El negocio.** Marea, tipo `SEAFOOD_RESTAURANT`, `en` + `es`, moneda USD
(el landing muestra precios en dólares), IVA 8%, con la dirección y el blurb
del footer traducidos.

**2. Horario.** Martes a domingo 12:00–23:00, lunes cerrado — el
"Open Tue–Sun · 12pm–11pm" del footer, en minutos desde medianoche (720–1380).

**3. Un usuario por rol**, para probar permisos sin inventar cuentas:
`super@`, `admin@`, `mesero@`, `mesera@`, `cliente@marea.test`, con sus
`BusinessMembership`.

**4. Seis categorías** con nombre en inglés y español: Starters/Entradas,
Soups & Salads/Sopas y Ensaladas, Main Dishes/Platos Fuertes,
Side Dishes/Guarniciones, Desserts/Postres, Beverages/Bebidas.

**5. Los nueve platillos reales**, con precio, tiempo de preparación y
descripción bilingüe. Los cuatro `mains` van marcados `isFeatured` porque son
los que hoy destaca el landing.

**6. Seis etiquetas** (crustáceos, sin gluten, vegetariano, vegano, sin
alcohol, sugerencia del chef) ligadas a los platillos que corresponden.

**7. Dos grupos de modificadores** para ejercitar los dos casos:
`size` (SINGLE, obligatorio — Normal / Grande +$6) ligado al Citrus Spritz, y
`extras` (MULTIPLE, hasta 3 — mantequilla extra +$2, limón extra +$0, trufa
+$8) ligado a los tres platos fuertes. Sin esto no puedes probar el cálculo de
`unitPrice = basePrice + Σ priceDelta`.

**8. Doce mesas** en tres zonas (Salón principal ×6 de 4 lugares, Terraza ×4 de
2, Barra ×2 de 6), cada una con su `qrToken`. Las capacidades distintas
importan: son las que prueban la búsqueda "mesa para 6".

**9. Las cuatro ofertas** del landing como `Promotion` reales, con sus dos
tipos (`BUNDLE_PRICE` y `PERCENTAGE`), sus `daysOfWeek` y sus platillos
ligados. Son el caso de prueba de que el modelo aguanta lo que hoy está
hardcodeado.

**10. Los seis testimonios** con la cita en inglés y español, `APPROVED` y
`isFeatured`.

**11. Cinco pedidos, uno por estado** (`PENDING`, `PREPARING`, `READY`,
`DELIVERED`, `CANCELLED`), con sus `OrderStatusEvent` y sus líneas con precio
congelado. Es lo que te deja abrir el tablero de cocina y ver las cinco
columnas pobladas desde el primer día. El `DELIVERED` trae un `Payment` de
Stripe `SUCCEEDED`; los demás traen uno `CASH_REGISTER` en `PENDING`.

**12. Cuatro reservaciones**: dos mañana (una `CONFIRMED`, una `PENDING`), una
pasado mañana para 6 personas en la barra, y una de ayer en `NO_SHOW`. La de
ayer es la que te deja verificar que las consultas de agenda filtran bien por
fecha, y las dos de mañana en mesas distintas son la base para probar el
solapamiento.

**Prueba manual que vale la pena hacer después del seed**, porque es la que
valida el requisito central del snapshot:

```bash
# 1. mira el ticket del pedido A-0004  → Garlic Butter Crab Legs a $48
# 2. sube el precio del platillo en el catálogo a $60
# 3. vuelve a abrir el ticket          → sigue diciendo $48 (correcto)
```

Si el paso 3 dice $60, algo está leyendo el catálogo en vez del snapshot.
