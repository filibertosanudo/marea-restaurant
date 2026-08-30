# Prompt para Claude Code — Módulo 4: correcciones de cobros y reservaciones

> Pégalo completo en `Desktop/restaurant-page`. Igual que los anteriores, se
> ejecuta con el skill `build-loop-claude-code` y **para al final de la Fase 2**
> a esperar aprobación del diseño.

---

Este encargo tiene dos mitades, con el mismo criterio de orden que el anterior:
primero **cerrar los once hallazgos de la revisión de `feature/payments-stripe`**
—cuatro de ellos son dinero mal contado— y después **reservaciones**, que es el
último circuito de cliente que falta antes de las pantallas de negocio.

El orden no es negociable. Los hallazgos 1, 2 y 5 significan que hoy un pedido
puede cobrarse dos veces y que un reembolso puede reportar éxito sin mover un
peso. Meter reservaciones encima de eso multiplica la superficie sin arreglar
nada.

Lee antes de empezar: `AGENTS.md` (**Next.js 16 — el middleware se llama
`proxy.ts`; lee `node_modules/next/dist/docs/`**), `docs/DATABASE.md` (la
sección de reservaciones explica por qué `endsAt` se guarda en vez de
calcularse), `docs/product/roles-y-alcance.md` (la matriz de permisos es el
contrato) y `docs/design.md`.

---

## Cómo trabajar: rama y commits

Lo mismo que el módulo pasado, que salió bien: 24 commits, ninguno pasó del
techo, promedio muy por debajo de las 400 líneas. Sostenlo.

**Rama.** `feature/reservations`, partida de un `main` **ya actualizado** — ver
la Fase 0.

**Commits.**

- Asunto en inglés, imperativo, ≤72 caracteres, una sola preocupación.
- **Cuerpo del mensaje: conciso, máximo 3 líneas**, y sólo cuando el *porqué*
  no se deduce del diff. Si el asunto ya lo explica, no escribas cuerpo. Nada
  de párrafos de justificación ni listas de viñetas dentro del commit: eso va
  en el código como comentario, o en el PR.
- **En ningún commit, comentario de código, documento, PR ni changelog se
  menciona con qué herramienta se escribió el código.** Sin `Co-authored-by`
  de asistentes, sin "generado con", sin firmas al pie. El historial habla del
  cambio, no de quién lo tecleó.
- **Techo: ~400 líneas o ~8 archivos.** Si un commit lo pasa, pártelo.
- **Commitea en cuanto una unidad compila y funciona**, no al cerrar la fase.
- **Nunca mezcles refactor con cambio de comportamiento** en el mismo commit.
- **Un cambio de esquema va solo, con su migración**, en su propio commit.
- **Sube al terminar cada fase** (`git push -u origin feature/reservations`).
  Nada de `--amend` ni force-push sobre lo ya subido.

---

## Fase 0 — Parte de un `main` actualizado

Mismo cuidado que la vez pasada. `feature/payments-stripe` tiene que estar
fusionada en `main` en GitHub antes de arrancar:

```bash
git switch main
git pull
git log --oneline main..feature/payments-stripe | wc -l   # tiene que dar 0
```

Si no da 0, **para y dime** qué commits quedaron fuera. Con el cero confirmado:

```bash
git switch -c feature/reservations
git fetch --prune
git branch --merged main | grep -v '^\*\| main$' | xargs -r git branch -d
```

Borra sólo las **locales**.

---

## Fase 1 — Los once hallazgos de la revisión de cobros

Cada uno es su propio commit. Los cinco primeros son de dinero; los demás son
de UI y de higiene, pero el 6 y el 7 también le mienten a quien lee la pantalla.

**1.1 — Un pedido pagado con tarjeta se puede volver a cobrar en caja.**
`createOrderFromCart` siempre crea un `Payment` `CASH_REGISTER`/`PENDING` por el
total, y `createPaymentIntentAction` crea una **segunda** fila `STRIPE` por ese
mismo total. Cuando el webhook marca la de Stripe `SUCCEEDED`, la de caja se
queda `PENDING` para siempre: `collectCashPaymentAction` sólo comprueba que el
pedido no esté cancelado, así que el botón "Cobrar" la encuentra y la cobra.
Resultado: `paidTotal` queda en el doble del total y ningún corte de turno
cuadra. Cerrar por los dos lados — que cobrar en caja rechace un pedido ya
saldado (`computePaymentSummary(...).isSettled`), y que marcar un pago
`SUCCEEDED` cancele las demás filas abiertas del mismo pedido cuando el total ya
quedó cubierto.

**1.2 — Elegir "tarjeta" y arrepentirse deja el pedido sin forma de cobrarse.**
El tablero lee **sólo el último pago** (`BOARD_INCLUDE` trae `take: 1`) y pinta
"Cobrar" únicamente cuando `paymentProvider === "CASH_REGISTER"`. En cuanto el
cliente toca "tarjeta" se crea la fila `STRIPE`, que pasa a ser la última; si
después elige caja, o si la tarjeta falla, el staff ya no ve el botón y el
pedido no se puede cobrar desde el tablero. La decisión de qué mostrar tiene que
salir del **resumen del pedido** (`computePaymentSummary` sobre todos sus pagos),
no de la última fila que se creó.

**1.3 — "Reintentar" deja el formulario de tarjeta vacío.** En
`CardPaymentPanel`, el efecto que monta el Payment Element depende sólo de
`clientSecret`. Cuando el estado pasa a `failed`, React desmonta el `div` donde
estaba montado; `handleRetry` regresa a `form` y renderiza un `div` nuevo y
vacío, pero el efecto no se vuelve a correr. El cliente ve el botón "Pagar" sin
campo de tarjeta arriba, y su única salida es recargar. Mantén el nodo de
montaje en el DOM (ocúltalo con CSS mientras no aplica) o vuelve a montar al
regresar a `form`.

**1.4 — Los reembolsos hechos desde el Dashboard de Stripe no se registran.**
`handleChargeRefunded` recorre `charge.refunds?.data`, pero desde la versión de
API 2022-11-15 `refunds` **no viene expandido** en el payload del webhook — por
eso el propio SDK lo declara `refunds?: ApiList<Refund> | null` — y aun cuando
viene, trae un máximo de diez. El bucle no hace nada: la fila `Refund` nunca se
crea, el drawer no muestra el reembolso y `refundedTotal` sigue en cero mientras
el dinero ya salió. Pide la lista explícitamente
(`stripe.refunds.list({ charge: charge.id })`) **antes** de abrir la
transacción, con el mismo criterio que ya usa `resolveChargeDetailsForEvent`
para el cargo.

**1.5 — Un reembolso "total" sobre un cobro en efectivo dice que sí y no hace
nada.** En modo `FULL`, `createRefundAction` hace `continue` sobre cualquier
pago sin `stripePaymentIntentId` — es decir, sobre todos los de caja — pero
igual responde `ok: true` con el detalle actualizado. El admin ve la operación
como exitosa mientras `refundableTotal` no se movió y no hay una sola fila que
lo explique. Decide y aplica una de las dos: o el reembolso en efectivo se
registra como tal (fila `Refund` con el usuario que lo entregó, el dinero sale
del cajón) o se rechaza con un error propio que diga que se devuelve en caja.
Lo que no puede quedarse es el "sí" silencioso.

**1.6 — `refundableForPayment` ignora los reembolsos `PENDING`.** Sólo suma los
`SUCCEEDED`, así que entre que se crea el reembolso y llega el webhook que lo
confirma, la misma cantidad se puede pedir otra vez. Stripe rechaza el segundo
(excedería el cargo) y el admin ve un `try_again` genérico sin entender por qué.
Un reembolso `PENDING` es dinero comprometido: descuéntalo también.

**1.7 — El tablero dice "por cobrar" en pedidos reembolsados y cancelados.**
`paymentDue = order.paymentStatus !== "SUCCEEDED"` pinta el badge naranja de
"por cobrar" para `REFUNDED`, `PARTIALLY_REFUNDED`, `FAILED` y `CANCELLED`. En
una pantalla que existe para leerse a tres metros, un pedido ya reembolsado
gritando "por cobrar" es exactamente el error que hace que alguien lo cobre. Son
tres lecturas, no dos: por cobrar / pagado / reembolsado — y un pedido cancelado
nunca dice "por cobrar".

**1.8 — El `clientSecret` reutilizado no comprueba el monto.**
`createPaymentIntentAction` devuelve el `client_secret` de un intent abierto sin
comparar `existing.amount` contra `toStripeAmount(order.total)`. Si el total
cambió, se cobra el viejo. Peor: la llave de idempotencia es fija por pedido
(`pi_create_${order.id}`), así que crear con un monto distinto bajo la misma
llave falla y la acción queda en `try_again` las siguientes 24 horas. Compara el
monto y actualiza el intent cuando difiera (`stripe.paymentIntents.update`), e
incluye el monto en la llave.

**1.9 — El webhook puede responder 500 antes de empezar.**
`resolveChargeDetailsForEvent` corre **fuera** del `try`: si `charges.retrieve`
falla por red o por límite de tasa, el handler revienta con 500 y Stripe entra
en su bucle de reintentos. Métela al `try` y degrada a `null` — el evento se
aplica igual, sólo sin marca ni últimos cuatro dígitos, que se pueden rellenar
después.

**1.10 — Estados que existen en el código y no en la realidad.** `PROCESSING` y
`REQUIRES_ACTION` están en la máquina de estados, en el diccionario, en el pill
del panel y en la pantalla del cliente, pero **ningún camino los escribe**:
faltan los manejadores de `payment_intent.processing` y
`payment_intent.requires_action`. Y la rama `succeeded` de `CardPaymentPanel` es
código muerto que su propio comentario reconoce como inalcanzable. Conéctalos o
bórralos, pero no los dejes a medias: un estado que la UI sabe pintar y el
backend nunca produce es una mentira que alguien va a creer al depurar.

**1.11 — El drawer no devuelve el foco al cerrarse.** `Drawer` enfoca el panel
al abrir y atrapa el Tab dentro, pero al cerrar no regresa el foco al badge que
lo abrió; con teclado, cerrar el drawer te deja al principio del documento.
Guarda el elemento activo al abrir y restáuralo al cerrar.

**Nota aparte, no es un hallazgo pero decídelo aquí:** `createPaymentIntentAction`
es un Server Action público cuya única credencial es el `publicToken`, y no tiene
límite de tasa. Hoy la llave de idempotencia contiene el daño; cuando toques el
1.8 y la llave deje de ser fija por pedido, deja de contenerlo. Ponle un límite
por pedido reutilizando `lib/auth/rate-limit.ts`, o dime por qué no hace falta.

---

## Fase 2 — Diseño (para y espera aprobación)

Dos superficies nuevas. Ninguna necesita tokens nuevos: la paleta semántica ya
cubre los seis estados de `ReservationStatus` igual que cubrió los ocho de
`PaymentStatus`.

**Formulario público de reserva.** Ya existe la caja en el landing
(`MareaLandingPage.tsx`, sección `#reservation`) y hoy es una maqueta: su
`onSubmit` hace `preventDefault()` y ya, los horarios salen de `TIME_SLOTS`
hardcodeado en `content.ts`. Va a conectarse de verdad, así que diseña los
estados que la maqueta no tiene: horarios cargando, día sin cupo, envío en
curso, reserva creada con su código de confirmación, y el error de "ese horario
se acaba de ocupar" — que es el caso real, no el excepcional, en un restaurante
lleno.

**Agenda del día en el panel.** No es un kanban: una reservación no avanza por
columnas, se lee por hora. Diseña una línea de tiempo o una lista por franja,
con el tamaño de golpe de vista que ya tiene el tablero de pedidos, y con
`partySize` y mesa asignada legibles a distancia.

Propón, enséñame y **para aquí**. No escribas la implementación de estas dos
pantallas hasta que te dé el visto bueno.

---

## Fase 3 — Disponibilidad: el núcleo del módulo

Lo demás es formulario. Esto es el módulo.

Una reservación es válida si, al mismo tiempo: cae dentro de un `OpeningHour`
del día (ojo con `closesAt > 1440`, que es el cierre después de medianoche), no
cae dentro de un `BusinessClosure`, `partySize <= Business.maxPartySize`, hay una
mesa con `seats` suficientes libre en el rango, y `reservedFor` está en el
futuro. `endsAt` se calcula al escribir (`reservedFor + durationMinutes`, con
`Business.defaultReservationMinutes` como default) — nunca se recalcula al leer.

**El solapamiento de verdad.** El índice `[tableId, reservedFor, endsAt]` hace
rápida la consulta, pero no impide nada: dos reservaciones concurrentes sobre la
misma mesa pueden pasar las dos la validación y escribirse las dos. El esquema
ya lo advierte y ya dice la solución — una `EXCLUDE` constraint de Postgres, que
Prisma no genera. Va **en su propio commit**, como migración de SQL puro,
requiere `btree_gist`, y **es el único cambio de base de datos autorizado en
este módulo**. Con la constraint puesta, la violación se atrapa en el Server
Action y se traduce a "ese horario se acaba de ocupar", no a un 500.

Escribe `lib/reservations/availability.ts` como función pura y probable: dado el
horario, los cierres, las mesas y las reservaciones existentes, devuelve las
franjas disponibles. Que sea pura importa: es la única pieza de este módulo que
merece pruebas de verdad y la única cuyo error se paga con una mesa vendida dos
veces.

---

## Fase 4 — El flujo del cliente

Conecta el formulario del landing a un Server Action real. Los horarios salen de
`availability.ts`, no de `TIME_SLOTS`; borra la constante muerta cuando ya nadie
la lea.

Reservar sin cuenta, igual que pedir sin cuenta: `guestName` obligatorio,
contacto obligatorio (correo o teléfono, al menos uno — un restaurante que no
puede avisar de un imprevisto no tiene reservación, tiene una nota). La reserva
nace en `PENDING` y el cliente recibe su `confirmationCode`.

Página de consulta por código, en la línea de `/o/[publicToken]`: ver la reserva,
y cancelarla si todavía falta tiempo suficiente. El código es toda la
autenticación de esa página, exactamente como el `publicToken` del pedido — el
mismo cuidado: nada de enumerar, nada de responder distinto según si el código
existe.

Encola la notificación con el patrón que ya existe (`NotificationJob`,
`dedupeKey`). **Sólo encolar**: el worker sigue fuera de alcance.

---

## Fase 5 — La agenda en el panel

La matriz de permisos ya lo dice y no se reinventa aquí: **`STAFF` confirma
reservaciones**, las sienta (`SEATED`) y las marca `NO_SHOW`; **cancelar es de
`BUSINESS_ADMIN`**, igual que cancelar un pedido, y por la misma razón.

Asignar mesa al confirmar. Si la mesa elegida ya no está libre, el error se
explica; no se pisa la reservación existente. `SEATED` es el punto donde
`RestaurantTable.status` pasa a `OCCUPIED`, y ahí conviene que te detengas un
segundo: hoy nada más escribe ese campo, y si esta fase lo empieza a mover sin
que el circuito del pedido lo lea, queda un dato que envejece solo. Decide y
dímelo.

La agenda vive bajo el shell del panel, con la misma i18n de cookie (`marea-lang`)
y el mismo diccionario partido por sección que ya usan pedidos y menú.

---

## Fase 6 — Cierre

1. `graphify` y luego
   `node scripts/graphify-to-obsidian.mjs --out "<vault>/04-Proyectos-Verticales/Marea-Codigo"`.
2. Revisa que `lib/reservations/` aparezca como módulo propio y que **no tenga
   aristas hacia `lib/payments/`**: reservar y cobrar no se tocan en v1, y si el
   grafo dice lo contrario es que algo se filtró.
3. Mira la sección "Conexiones que cruzan módulos". Cualquier arista nueva que
   no esperabas es una dependencia que se te coló.

---

## Reglas técnicas

Las de siempre: Server Components por defecto · mutaciones con Server Actions
validadas con Zod · `Prisma.Decimal` nunca cruza a un Client Component (pásalo
por `lib/dto/`) · `deletedAt: null` en todo query de catálogo · `businessId`
siempre desde `getCurrentBusiness()` · `requireRole()` en la primera línea de
cada mutación · todo lo que toque dinero o estado va en transacción · el
servidor no confía en el cliente para precio, disponibilidad ni permisos · sin
librerías de UI nuevas · accesible con teclado y AA · build y lint limpios, sin
`any` ni `@ts-ignore`.

Tres para este módulo:

- **Ninguna fecha se interpreta en el cliente.** El navegador manda día y hora
  locales del negocio; el servidor las resuelve contra la zona horaria del
  negocio. Nada de `new Date(string)` sobre entrada del usuario en un componente.
- **Ninguna disponibilidad se calcula dos veces.** `availability.ts` es la única
  fuente; el formulario pinta lo que le den, no filtra por su cuenta.
- **La `EXCLUDE` constraint es la última palabra**, no la validación previa. La
  validación existe para dar un buen mensaje; la constraint existe para que la
  mesa no se venda dos veces.

---

## Definición de terminado

- [ ] La rama salió de un `main` actualizado y `main..feature/payments-stripe` da 0.
- [ ] Pago con tarjeta un pedido y el botón "Cobrar" ya no aparece ni funciona
      llamando al Server Action directo.
- [ ] Elijo tarjeta, me arrepiento y elijo caja: el staff puede cobrarme.
- [ ] Falla la tarjeta, toco "Reintentar" y el campo de tarjeta está ahí.
- [ ] Reembolso desde el Dashboard de Stripe y el drawer lo muestra en menos de
      un minuto, con su monto correcto.
- [ ] Un pedido reembolsado no dice "por cobrar" en el tablero.
- [ ] Reservo desde el landing y recibo un código; consulto con el código y veo
      mi reserva.
- [ ] Dos reservaciones simultáneas sobre la misma mesa y horario: una entra, la
      otra recibe "ese horario se acaba de ocupar", ninguna revienta.
- [ ] Un día cerrado por `BusinessClosure` no ofrece un solo horario.
- [ ] Un `STAFF` confirma y sienta reservaciones pero no puede cancelarlas.
- [ ] Ningún commit de la rama pasa de ~400 líneas, ningún cuerpo de commit
      pasa de 3 líneas, y ninguno menciona con qué se escribió.

---

## Lo que NO debes hacer

- Promociones, testimonios, mesas/QR, reportes, dashboard de métricas, worker de
  notificaciones (sigue siendo sólo encolar).
- Cobrar un depósito por la reservación. Reservar y cobrar no se tocan en v1.
- Lista de espera, recordatorios automáticos, reprogramar desde el cliente.
- Cambiar el esquema de Prisma. Lo único autorizado es la migración de SQL puro
  con la `EXCLUDE` constraint. Si crees que falta un campo, **para y pregúntame**.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase y
`/security-review` en las fases 1 y 4 — son las que tocan dinero y una página
pública autenticada por código. **Para al final de la Fase 2** y espera el visto
bueno del diseño; después avanza de corrido, subiendo la rama y reportando al
cerrar cada fase.
