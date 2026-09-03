# Prompt para Claude Code — Módulo 2: el circuito del pedido

> Errata (módulo 7): el descarte de Supabase Realtime y el razonamiento de
> facturación de Vercel quedaron sin efecto.
> Ver docs/PLAN-PRODUCCION.md y docs/prompts/07-postgres-y-deploy-portatil.md.

> Pégalo completo en `Desktop/restaurant-page`. Igual que el anterior, se
> ejecuta con el skill `build-loop-claude-code` y **para al final de la Fase 1**
> a esperar aprobación del diseño.

---

Vas a construir **el circuito completo del pedido**: el cliente escanea el QR de
su mesa, arma su pedido desde el celular, y la cocina lo ve aparecer en un
tablero en vivo y lo mueve por sus estados hasta entregarlo.

Los dos lados van en el mismo módulo a propósito. Por separado ninguno es
demostrable: un tablero sin pedidos reales sólo enseña datos de seed, y un
carrito que no llega a ninguna pantalla no cierra el circuito.

Lee antes de empezar: `AGENTS.md` (**Next.js 16 tiene cambios de ruptura — el
middleware ahora se llama `proxy.ts`, léete las guías de
`node_modules/next/dist/docs/` que apliquen**), `docs/DATABASE.md`,
`docs/product/roles-y-alcance.md` (la matriz de permisos es el contrato) y
`docs/design.md`.

## Fase 0 — Deuda del módulo anterior (arréglala antes de features nuevas)

Salieron tres cosas en la revisión. Las dos primeras son de seguridad.

**0.1 — El JWT rancio deja entrar a empleados dados de baja.**
`setTeamMemberActiveAction` pone `isActive = false` en la membresía, pero el
token ya emitido sigue siendo válido y no hay `maxAge` configurado, así que
hereda el default de 30 días de Auth.js. Un mesero despedido conserva acceso
hasta un mes, y un cambio de rol tampoco se propaga. Arréglalo con las dos
medidas juntas:

- `session: { strategy: "jwt", maxAge: 60 * 60 * 8 }` — un turno, no un mes.
- Revalidación contra la base: guarda en el token un `checkedAt`, y en el
  callback `jwt` — si pasaron más de ~60 segundos — vuelve a leer la membresía
  y actualiza `role` / `isActive`. Si la membresía ya no está activa, invalida
  la sesión. Es una consulta barata y amortizada, no una por request.

**0.2 — El rate limit vive en memoria y sólo mira el correo.** Se reinicia en
cada deploy, no sirve con más de una instancia (Vercel escala a varias), y
limitar sólo por correo deja pasar el rociado: 5 intentos contra 10 000 correos
distintos no toca el límite nunca. Muévelo a una tabla de Postgres con clave
compuesta por correo **y** por IP, con ventana deslizante. Si prefieres no
tocar el esquema, usa `NotificationJob`… no: crea una tabla propia y **avísame
antes** — es el único cambio de esquema que no tengo ya aprobado.

**0.3 — Faltan `.gitattributes`.** Hay 10 archivos que aparecen modificados en
`git status` y son puro cambio de fin de línea: `git diff -w` sale vacío, pero
son 11 810 líneas fantasma que van a arruinar cualquier revisión futura. Agrega
`* text=auto eol=lf` (con `*.bat`/`*.cmd` en `eol=crlf`), corre
`git add --renormalize .` y haz un commit sólo de eso, aparte.

## Cambios de esquema ya aprobados

Los agregué yo a `prisma/schema.prisma`; están comentados ahí. **No agregues
ninguno más sin preguntarme.**

- `Business.orderSequence Int @default(0)` — el contador del folio.
- `Order.publicToken String @unique @default(cuid())` — el token de la pantalla
  pública de seguimiento.

Como `publicToken` es `NOT NULL UNIQUE` sobre una tabla que ya tiene los
pedidos del seed, la migración no puede aplicarse en caliente. Es data de
desarrollo: corre `npm run db:reset`. Si eso te falla, dime, no improvises un
backfill.

## Fase 1 — Diseño primero (para y espera mi aprobación)

Cuatro superficies, y **dos de ellas tienen restricciones físicas que no puedes
resolver con buen gusto genérico**:

1. **Menú digital en celular** (`/t/[qrToken]`). Pulgar, una mano, posiblemente
   con poca luz y con el mesero esperando. Categorías navegables sin scroll
   infinito, carrito siempre alcanzable, foto grande porque la gente pide con
   los ojos.
2. **Tablero de cocina** (`/admin/pedidos`). **Se lee a tres metros de
   distancia, con las manos ocupadas.** Tipografía enorme, contraste alto,
   columnas por estado, cero afordancias que dependan de hover, botones del
   tamaño de un dedo con guante. Los pedidos envejecen visualmente: un pedido de
   más de N minutos cambia de color. Alerta visual (y opcionalmente sonora, con
   interruptor) cuando entra uno nuevo.
3. **Vista del mesero**, la misma ruta pero en celular: lista compacta en vez de
   columnas.
4. **Seguimiento del cliente** (`/o/[publicToken]`). Una sola pantalla, un solo
   dato importante: en qué va mi comida.

Usa los skills `design-system` (para los patrones nuevos: `OrderCard`,
`KanbanColumn`, `StatusStepper`, `CartSheet`, `QuantityStepper`,
`StickyCartBar`, `AgingIndicator`) y `design-better` (para el craft). Todo con
los tokens existentes; si necesitas uno nuevo, va a `docs/design.md` y
`styles/tokens.css` con su valor claro y oscuro y su verificación de contraste.
Componentes nuevos en `components/admin/` y `components/order/` — **no toques
`components/ui/`**, que es la librería que se publica.

Enséñame las cuatro pantallas antes de construirlas.

## Fase 2 — Menú público y carrito

- Ruta `/t/[qrToken]`: resuelve la mesa por `RestaurantTable.qrToken`. Token
  inválido o mesa inactiva → 404 honesto, no un error genérico. Guarda la mesa
  en cookie para que el cliente pueda navegar sin perder el contexto.
- Ruta `/menu` sin mesa, para pedidos para llevar. La misma UI, `orderType`
  distinto.
- Reutiliza `getPublicMenuRaw` / `toPublicMenuByLang` que ya existen. Si no dan
  lo que necesitas (modificadores, por ejemplo), extiéndelos ahí, no dupliques.
- Carrito **persistido** en las tablas `Cart` / `CartItem` / `CartItemModifier`,
  identificado por una cookie `marea-cart` para el invitado. Motivo: el cliente
  cambia de app, se le bloquea el teléfono, vuelve, y su carrito sigue ahí.
- **En el carrito los precios son vivos**, se leen del catálogo en cada render.
  Si el negocio sube un precio mientras el carrito está abierto, el cliente ve
  el precio nuevo. El congelamiento pasa en el checkout, no antes.
- Modificadores: respeta `selectionType`, `minSelections`, `maxSelections` e
  `isRequired`. Valida en el servidor, no sólo en la UI.
- Un platillo con `isAvailable = false` o `deletedAt` no se puede agregar, y si
  ya estaba en el carrito se marca como no disponible y se excluye del total.

## Fase 3 — Crear el pedido (aquí está la lógica que importa)

Un solo Server Action, todo dentro de **una transacción**:

1. Relee del catálogo cada línea del carrito. **Nunca confíes en los precios que
   manda el cliente.**
2. Verifica disponibilidad otra vez. Si algo se agotó entre que armó el carrito
   y le dio confirmar, aborta con un mensaje claro que diga qué platillo fue.
3. **Congela el snapshot**: `OrderItem.nameSnapshot`, `unitPrice`
   (= `basePrice` + suma de `priceDelta`), `quantity`, `lineTotal`; y
   `OrderItemModifier.nameSnapshot` + `priceDelta`. Este es el requisito central
   del sistema, está explicado en `docs/DATABASE.md` §2.2.
4. Genera el folio con `business.orderSequence` incrementado atómicamente
   (`{ increment: 1 }`) **dentro de la misma transacción**. Nunca con un
   `COUNT(*)`: dos cajas simultáneas generarían el mismo folio.
5. Calcula `subtotal`, `taxTotal` (con `Business.taxRate`) y `total`, y guárdalos.
6. Crea el `OrderStatusEvent` inicial (`toStatus: PENDING`).
7. Crea un `Payment` en `CASH_REGISTER` / `PENDING` por el total — así el
   tablero puede mostrar qué está por cobrar. Stripe es el módulo 4.
8. Encola los `NotificationJob` correspondientes con su `dedupeKey`
   (patrón outbox, `docs/DATABASE.md` §1.6). **No construyas el worker ni mandes
   correos todavía** — sólo deja las filas encoladas, correctamente.
9. Vacía el carrito y redirige a `/o/[publicToken]`.

Datos del invitado: nombre y teléfono obligatorios, correo opcional. Se copian a
`Order.guestName` / `guestPhone` / `guestEmail`, no se leen por relación.

## Fase 4 — Tablero de pedidos

Ruta `/admin/pedidos`, accesible a `STAFF` y arriba.

- Columnas por estado: Pendiente · En preparación · Listo · Entregado. Los
  cancelados van a una pestaña aparte, no a una columna.
- Cada tarjeta: folio, mesa o "Para llevar", tiempo transcurrido desde
  `placedAt` que sube solo, las líneas con cantidad y modificadores, las notas
  del cliente destacadas (una alergia no puede pasar desapercibida), y el estado
  del pago.
- Transiciones con un toque. **Respeta la matriz de permisos**: `STAFF` avanza
  estados y cobra en efectivo; **cancelar es sólo de `BUSINESS_ADMIN`**, y pide
  motivo. Verifica el rol en el servidor, en cada action, no sólo escondiendo el
  botón.
- Cada transición escribe su `OrderStatusEvent` con `changedById`, y encola su
  notificación, en la misma transacción que actualiza `Order.status`.
- Transiciones ilegales rechazadas en el servidor (de `DELIVERED` no se regresa
  a `PREPARING`). Define la máquina de estados en un solo módulo,
  `lib/orders/state-machine.ts`, y úsala en los dos lados.
- Filtros por tipo de pedido y por mesa. La consulta se apoya en los índices
  `[businessId, status, placedAt]` y `[tableId, status]` que ya existen.

## Fase 5 — Tiempo real

**No uses Supabase Realtime.** El entorno de desarrollo corre contra un Postgres
local (lo dice `lib/storage/config.ts`), así que amarrarte a Supabase te deja
sin realtime en dev — y `LISTEN/NOTIFY` tampoco es opción, porque no sobrevive
al pooler en modo transacción de Supabase en producción.

Haz esto: un route handler de SSE (`/api/orders/stream`) que del lado del
servidor consulte los cambios cada 2 segundos y **empuje sólo cuando algo cambió**
(compara contra el `updatedAt` más reciente, o contra el último
`OrderStatusEvent.id`). El cliente mantiene una sola conexión con
`EventSource`. Ventajas: funciona igual en local y en Vercel, no depende de
proveedor, y se puede cambiar por Realtime después sin tocar la UI.

- Reconexión automática con backoff, e indicador visible de "sin conexión". Una
  cocina que cree que no hay pedidos porque se cayó el socket es peor que una
  sin tablero.
- La misma técnica alimenta `/o/[publicToken]` del lado del cliente.
- Cierra el stream correctamente al desmontar y al cerrar el request.

## Reglas técnicas (las mismas del módulo 1, más dos)

Server Components por defecto · mutaciones con Server Actions validadas con Zod ·
`Prisma.Decimal` nunca cruza a un Client Component (pásalo por `lib/dto/`) ·
`deletedAt: null` en todo query de catálogo · `businessId` siempre desde
`getCurrentBusiness()` · `requireRole()` en la primera línea de cada mutación ·
sin librerías de UI nuevas · accesible con teclado y AA de contraste ·
`npm run build` y `npm run lint` limpios, sin `any` ni `@ts-ignore`.

Las dos nuevas:

- **Todo lo que toque dinero o estado va dentro de una transacción.** Crear el
  pedido, cambiar de estado, registrar el cobro. Nunca en llamadas sueltas.
- **El servidor no confía en el cliente para nada de precio, disponibilidad ni
  permisos.** El cliente manda ids y cantidades; el resto se relee.

## Definición de terminado

- [ ] Escaneo el QR de la mesa 4 con el celular, veo el menú en el idioma
      correcto y agrego dos platillos con modificadores.
- [ ] Cierro el navegador, vuelvo a entrar y mi carrito sigue ahí.
- [ ] Confirmo el pedido: obtengo un folio y una pantalla de seguimiento.
- [ ] El pedido aparece **solo** en el tablero de cocina, sin recargar, en menos
      de 3 segundos.
- [ ] Muevo el pedido a "En preparación" y la pantalla del cliente se actualiza
      sola.
- [ ] Cambio el precio del platillo en `/admin/menu` y el pedido ya creado
      **sigue mostrando el precio con el que se ordenó**.
- [ ] Un `STAFF` puede avanzar estados y cobrar en efectivo, pero cancelar le
      responde error — también si llama al Server Action directamente.
- [ ] Se crearon las filas de `OrderStatusEvent` y `NotificationJob` que tocaban.
- [ ] El tablero se lee a tres metros y funciona en un celular.
- [ ] Build y lint limpios.

## Lo que NO debes hacer

- Stripe, reservaciones, promociones, testimonios, reportes, mesas/QR (la
  pantalla de administración de mesas; **sí** consumes el `qrToken` que ya
  existe en el seed). El worker de notificaciones tampoco: sólo encolar.
- No agregues campos al esquema más allá de los dos ya aprobados. Si crees que
  falta uno, para y pregúntame.
- No refactorices el módulo del menú "de paso", más allá de la deuda de la
  Fase 0.

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase y
`/security-review` al terminar las fases 0 y 3 — son las que tocan sesiones y
dinero. **Para al final de la Fase 1** y espera mi visto bueno del diseño;
después avanza de corrido reportando cada fase.
