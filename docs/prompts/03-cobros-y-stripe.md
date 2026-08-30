# Prompt para Claude Code — Módulo 3: cobros, correcciones y Stripe

> Pégalo completo en `Desktop/restaurant-page`. Igual que los anteriores, se
> ejecuta con el skill `build-loop-claude-code` y **para al final de la Fase 2**
> a esperar aprobación del diseño.

---

Este encargo tiene dos mitades: **arreglar los siete hallazgos de la revisión
del circuito del pedido**, y luego **cobrar de verdad — Stripe más el cobro en
caja**. Van juntas a propósito: cuatro de los siete hallazgos son del ciclo de
vida del pago, y arreglarlos justo antes de meter un segundo proveedor de cobro
es el orden correcto. Si primero agregas Stripe, duplicas los bugs.

Lee antes de empezar: `AGENTS.md` (**Next.js 16 — el middleware se llama
`proxy.ts`; lee `node_modules/next/dist/docs/`**), `docs/DATABASE.md`
(secciones 1.8 y 2.3 sobre por qué `Payment` y `Refund` son tablas aparte),
`docs/product/roles-y-alcance.md` (la matriz de permisos es el contrato) y
`docs/design.md`.

---

## Cómo trabajar: rama y commits

Ya tienes el hábito de ramas por feature (`feature/admin-auth`,
`feature/landing-menu-from-db`) y commits en inglés, imperativos, de una sola
cosa. **Sostenlo, con tres correcciones.**

**Rama.** `feature/payments-stripe`, partida de un `main` **ya actualizado** —
ver la Fase 0, que no es opcional. Respeta el prefijo `feature/`: las últimas dos
ramas se llamaron `fase-0-deuda-seguridad` y `fase-2-menu-carrito` y rompen la
convención de las otras diez.

**Commits.** Asunto en inglés, imperativo, ≤72 caracteres, una sola
preocupación. Tu promedio actual son 49 caracteres y está bien; el cuerpo del
mensaje sólo cuando el *porqué* no se deduce del diff.

El problema no es la longitud del asunto, es el tamaño del diff. Dos commits del
módulo pasado fueron bloques:

- `Add /menu and /t/[qrToken]` — 12 archivos, 874 líneas
- `Add /admin/pedidos: kanban board + compact waiter view` — 10 archivos, 795 líneas

Ambos son "una pantalla", pero una pantalla no es una unidad de revisión: nadie
revisa 874 líneas, se aprueban de un vistazo. Los demás commits del módulo
(`Add table lookup by QR token`, 21 líneas; `Lock the cart row before checkout
re-reads its items`, 18) sí son revisables. Ese es el tamaño objetivo.

Reglas concretas:

- **Techo: ~400 líneas o ~8 archivos.** Si un commit lo pasa, pártelo. Una
  pantalla se parte por componente: primero los componentes de presentación,
  luego el contenedor, luego la ruta que los monta.
- **Commitea en cuanto una unidad compila y funciona**, no al cerrar la fase.
- **Nunca mezcles refactor con cambio de comportamiento** en el mismo commit.
  Si necesitas mover algo de lugar para poder agregar la función, son dos
  commits: primero el movimiento sin cambio de conducta, después la función.
- **Un cambio de esquema va solo, con su migración**, en su propio commit.
- **Sube al terminar cada fase** (`git push -u origin feature/payments-stripe`).
  Nada de `--amend` ni force-push sobre lo ya subido.

---

## Fase 0 — Parte de un `main` actualizado

El PR del circuito del pedido ya se fusionó en `main` en GitHub. **El `main` de
este disco no se enteró**: sigue en `daf1a67 Initial commit: Marea seafood
restaurant scaffold`, 134 commits atrás del trabajo. Si creas la rama nueva
desde ese `main` local, arrancas desde el andamiaje vacío y todo el panel de
administración y el circuito del pedido aparecerán como borrados.

```bash
git switch main
git pull                      # avance rápido: main local es ancestro directo
git log --oneline -1          # debe mostrar el merge del PR, no "Initial commit"
```

**Verifica que el PR se llevó todo antes de seguir.** `fase-2-menu-carrito`
contiene a `fase-0-deuda-seguridad` y a las otras once ramas — es lineal, todo
está ahí — pero compruébalo en lugar de confiar:

```bash
git log --oneline main..fase-2-menu-carrito | wc -l     # tiene que dar 0
git log --oneline main..fase-0-deuda-seguridad | wc -l  # tiene que dar 0
```

Si alguno no da 0, **para y dime** qué commits quedaron fuera: significa que el
PR no cubrió todo y hay que subir el resto antes de tocar nada.

Con los dos ceros confirmados, crea la rama de este módulo:

```bash
git switch -c feature/payments-stripe
```

Y de paso limpia: las doce ramas locales anteriores ya están todas contenidas
en `main` y sólo estorban al leer `git branch`.

```bash
git fetch --prune
git branch --merged main | grep -v '^\*\| main$' | xargs -r git branch -d
```

Borra sólo las **locales**. Las remotas se borran desde GitHub al cerrar cada
PR, y ésa es decisión del usuario, no tuya.

## Fase 1 — Los siete hallazgos

Cada uno es su propio commit.

**1.1 — Se puede cobrar un pedido cancelado.** `cancelOrderAction` no toca
`Payment`, así que el cobro en `CASH_REGISTER`/`PENDING` sobrevive a la
cancelación; y `collectCashPaymentAction` filtra por proveedor y estado del
*pago*, nunca por el estado del *pedido*. Aunque la UI no pinte el botón en la
pestaña de cancelados, el Server Action es invocable directo — y sin llegar a
eso, los pedidos cancelados quedan como "por cobrar" para siempre y ningún corte
de caja va a cuadrar. Cancelar debe pasar sus pagos `PENDING` a `CANCELLED`
dentro de la misma transacción, y cobrar debe rechazar un pedido cancelado.

**1.2 — El tablero no se lee a tres metros.** Es el único requisito explícito de
la Fase 1 del módulo pasado que no aterrizó. El texto más grande de una tarjeta
es el folio a 20px, los platillos van a 12px y el indicador de antigüedad a 12px:
escala de tabla de administración, no de pantalla de cocina. Sube la escala de
`OrderCard` y `KanbanColumn` a algo legible a tres metros — del orden de 40–60px
para folio y líneas del pedido, con el resto en proporción. La vista compacta de
mesero **no cambia**: son dos densidades de la misma pantalla, así que
resuélvelo con una variante explícita (`density="kitchen" | "waiter"`), no
duplicando componentes ni con un puñado de `md:` sueltos.

**1.3 — Los modificadores no se revalidan en el checkout.**
`validateModifierSelection` (que verifica `minSelections`, `maxSelections` e
`isRequired`) sólo se llama en `addToCartAction`. `createOrderFromCart` relee
precios y disponibilidad pero de los modificadores sólo mira `isAvailable`. Si
marcas un grupo como obligatorio con carritos abiertos, esos pedidos se cierran
inválidos. Llama la misma función dentro de la transacción de checkout y falla
con un `CheckoutError` que nombre el platillo, igual que los otros casos.

**1.4 — `collectCashPaymentAction` es la única mutación de dinero fuera de
transacción.** Hace `findFirst` y luego `update` por id, sin lock: dos toques
simultáneos y ambos escriben, así que `collectedByUserId` y `paidAt` se los
queda quien gane la carrera y el corte de turno puede atribuirle el cobro a la
persona equivocada. Métela en transacción con `SELECT … FOR UPDATE`, igual que
hiciste (bien) en `advanceOrderStatusAction`.

**1.5 — `trackInventory` y `stockQuantity` no se leen en ningún lado.** Cero
referencias en todo el código: un platillo con stock 0 se sigue vendiendo. Haz
que el checkout, dentro de su transacción, verifique el stock cuando
`trackInventory` es true y lo decremente; y que el menú público oculte lo
agotado. Si el decremento deja el stock en 0, apaga `isAvailable`.

**1.6 — El stream SSE no tiene vida máxima.** Dos consultas cada 2 s, para
siempre. Una pantalla de cocina abierta doce horas son ~43 000 consultas
diarias, y en Vercel además quema una invocación continua. Ponle un tope de vida
de 60–90 s y cierra limpio; `EventSource` reconecta solo y tu hook ya trae
backoff.

**1.7 — `LoginAttempt` crece sin límite** para correos que nunca aciertan: sólo
se limpia por correo al iniciar sesión bien. Bórralos por antigüedad (fuera de
la ventana de 15 minutos) en el mismo `recordLoginAttempt`.

Cierra la fase con `/security-review` y sube la rama.

## Fase 2 — Diseño (para y espera aprobación)

Tres superficies nuevas, más el ajuste de la 1.2:

1. **Pago del cliente** en el celular, al final del checkout: elegir entre pagar
   ahora con tarjeta o pagar en caja, el formulario de tarjeta, y los estados de
   procesando / requiere autenticación / falló / listo. **El estado de error
   importa más que el feliz**: alguien con la comida ya pedida y una tarjeta
   rechazada necesita saber en una línea qué hacer.
2. **Cobro en el tablero**: qué pedidos están por cobrar, cuánto, y con qué se
   pagó cada uno.
3. **Reembolso**, sólo administrador: monto total o parcial, motivo, y el
   historial de reembolsos de ese pedido.

Usa los skills `design-system` y `design-better`. Patrones nuevos que vas a
necesitar: `PaymentMethodChoice`, `PaymentStatusPill`, `AmountBreakdown`,
`RefundForm`. Todo con los tokens existentes; si falta uno, va a `docs/design.md`
y `styles/tokens.css` con su valor claro, oscuro y su verificación de contraste.
Componentes nuevos en `components/admin/` y `components/order/` — **no toques
`components/ui/`**, que es la librería que se publica.

## Fase 3 — Un solo dueño del ciclo de vida del cobro

Antes de Stripe, centraliza. Crea `lib/payments/` como el único módulo que
decide transiciones de `Payment`, igual que `lib/orders/state-machine.ts` es el
único que decide transiciones de `Order`.

- Un pedido puede tener **varios** pagos: un intento fallido y uno bueno, una
  cuenta dividida, anticipo y resto. La UI debe leer "lo pagado" como la suma de
  los `SUCCEEDED`, nunca como "el pago del pedido".
- Cancelar un pedido cancela sus pagos pendientes (hallazgo 1.1).
- Un pedido está saldado cuando la suma de `SUCCEEDED` menos los reembolsos
  cubre el total.
- Las transiciones ilegales se rechazan en el servidor (de `REFUNDED` no se
  vuelve a `SUCCEEDED`).

## Fase 4 — Stripe

Modo de prueba. `Payment` ya tiene `stripePaymentIntentId`, `stripeChargeId`,
`paymentMethodBrand`, `paymentMethodLast4` y `receiptUrl`; `StripeWebhookEvent`
existe y no se ha usado nunca.

- **Convierte a la unidad mínima al hablar con Stripe.** `Decimal("42.00")` es
  `4200`, y se calcula con `.mul(100)`, no con aritmética de punto flotante. Es
  el bug clásico de esta integración.
- Crea el PaymentIntent en un Server Action con `automatic_payment_methods`, la
  moneda del negocio y una **clave de idempotencia** derivada del pedido, para
  que un doble envío no cobre dos veces.
- **El webhook es la única fuente de verdad.** El cliente que vuelve de Stripe
  diciendo "pagué" no prueba nada: es un parámetro de URL. Nunca marques
  `SUCCEEDED` desde el redirect.
- Webhook en `app/api/webhooks/stripe/route.ts`: cuerpo **crudo** (Next 16 lo
  entrega con `await request.text()`, no uses el parseado), verifica la firma
  con `STRIPE_WEBHOOK_SECRET`, y **inserta el `eventId` en
  `StripeWebhookEvent` dentro de la MISMA transacción que aplica el efecto**. Si
  el insert choca con el índice único, ya lo procesaste: responde 200 y no hagas
  nada. Stripe reenvía; sin esto cobras dos veces.
- Maneja al menos: `payment_intent.succeeded`, `payment_intent.payment_failed`,
  `payment_intent.canceled`, `charge.refunded`.
- Responde rápido y con 2xx aunque el evento no te interese; un 500 hace que
  Stripe reintente en bucle.
- Documenta en el README cómo probarlo local con `stripe listen --forward-to`.
- El cobro en caja sigue existiendo tal cual y es la opción por defecto cuando
  `Business.acceptsOnlinePayment` es false.

## Fase 5 — Reembolsos

Sólo `BUSINESS_ADMIN` y arriba, por la matriz. Total o parcial, con motivo
obligatorio. Crea el `Refund` en la misma transacción que llama a Stripe, y deja
que el webhook `charge.refunded` confirme el estado — no lo des por bueno con la
respuesta síncrona. Un reembolso que supere lo cobrado se rechaza en el servidor.

## Fase 6 — Cierre

1. `graphify` y luego
   `node scripts/graphify-to-obsidian.mjs --out "<vault>/04-Proyectos-Verticales/Marea-Codigo"`.
2. Abre `00-Mapa-del-Codigo.md` y revisa dos cosas: que exista un módulo de
   pagos reconocible y no quede desperdigado entre otros tres, y la sección
   **"Conexiones que cruzan módulos"** — cualquier arista nueva que no esperabas
   es una dependencia que se te coló.
3. Si `lib/payments/` no aparece como módulo propio, es señal de que no quedó
   cohesionado. Dímelo antes de dar por cerrada la fase.

**Graphify también te sirve durante la Fase 3, no sólo al final**: antes de
cambiar la firma de algo compartido, córrelo y mira el grado del símbolo. Para
calibrar, hoy `getCurrentBusiness()` tiene 55 conexiones y `requireRole()` 27 —
ese número es literalmente tu radio de impacto.

## Reglas técnicas

Las de siempre: Server Components por defecto · mutaciones con Server Actions
validadas con Zod · `Prisma.Decimal` nunca cruza a un Client Component (pásalo
por `lib/dto/`) · `deletedAt: null` en todo query de catálogo · `businessId`
siempre desde `getCurrentBusiness()` · `requireRole()` en la primera línea de
cada mutación · todo lo que toque dinero o estado va en transacción · el
servidor no confía en el cliente para precio, disponibilidad ni permisos · sin
librerías de UI nuevas · accesible con teclado y AA · build y lint limpios, sin
`any` ni `@ts-ignore`.

Dos nuevas:

- **Ningún secreto de Stripe en código de cliente.** Sólo la clave publicable
  cruza al navegador. Agrega las variables a `.env.example` sin valores.
- **Ningún importe se calcula en el cliente.** El cliente pide "cobrar el pedido
  X"; el monto lo determina el servidor releyendo el pedido.

## Definición de terminado

- [ ] La rama salió de un `main` actualizado y `main..fase-2-menu-carrito` da 0.
- [ ] El tablero se lee a tres metros y la vista de mesero sigue compacta.
- [ ] Cancelo un pedido y su cobro pendiente queda en `CANCELLED`; intentar
      cobrarlo responde error, también llamando al Server Action directo.
- [ ] Un platillo con `trackInventory` y stock 1 se agota solo al segundo pedido.
- [ ] Pago con la tarjeta de prueba `4242…` y el pedido queda saldado **por el
      webhook**, no por el redirect.
- [ ] Reenvío el mismo evento con `stripe trigger` y no se cobra dos veces.
- [ ] La tarjeta `4000 0025 0000 3155` dispara el 3D Secure y la UI lo maneja.
- [ ] Un `STAFF` cobra en efectivo pero no puede reembolsar.
- [ ] Reembolso parcial: el pedido queda parcialmente reembolsado y el historial
      lo muestra.
- [ ] Las notas de Obsidian regeneradas muestran un módulo de pagos propio.
- [ ] Ningún commit de la rama pasa de ~400 líneas.

## Lo que NO debes hacer

- Reservaciones, promociones, testimonios, mesas/QR, reportes, dashboard de
  métricas, worker de notificaciones (sigue siendo sólo encolar).
- Stripe Connect / multi-cuenta. Un solo negocio cobra a una sola cuenta.
- Guardar datos de tarjeta. Nunca. Sólo los identificadores de Stripe, la marca
  y los últimos cuatro dígitos, que ya están en el esquema.
- Cambiar el esquema. Todo lo que necesitas ya existe (`Payment`, `Refund`,
  `StripeWebhookEvent`). Si crees que falta algo, **para y pregúntame**.

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase y
`/security-review` en las fases 1, 4 y 5 — son las que tocan sesiones y dinero.
**Para al final de la Fase 2** y espera el visto bueno del diseño; después
avanza de corrido, subiendo la rama y reportando al cerrar cada fase.
