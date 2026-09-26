# Prompt para Claude Code — Módulo 17b: Stripe Connect

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **Para al final de la Fase 1** con las respuestas de
> alcance. Hay dinero de terceros en juego: esa parada no es opcional.

---

El módulo 17 dejó el sistema vendiendo dos veces. Un negocio por petición, RLS
con `marea_app`, organización, `ORG_ADMIN`, alta de negocios sin tocar la base,
y una prueba de extremo a extremo con dos negocios en un despliegue.

Y dejó una cosa deliberadamente sin hacer, con una prueba que la sostiene:
`lib/payments/availability.ts` impide que un negocio sin `stripeAccountId`
active el cobro con tarjeta en cuanto existe un segundo negocio en la base. El
comentario de ese archivo dice por qué, y vale la pena leerlo textual antes de
seguir:

> *Every card payment goes through the platform's one Stripe key, so the money
> lands in the platform's account. That is the owner's own account while they are
> the only business on the deployment. The moment a second, unrelated business
> exists, the platform would be holding somebody else's funds.*

Ese candado es correcto y es también un techo. Mientras esté cerrado, el
producto que el módulo 17 hizo vendible sólo se puede vender a restaurantes que
acepten cobrar en efectivo. **Este módulo abre el candado por la vía legítima:
cada negocio cobra a su propia cuenta de Stripe, y la plataforma no toca ese
dinero.**

No es un módulo de funcionalidad nueva para el comensal. La pantalla de pago se
ve igual. Lo que cambia es de quién es el dinero, y eso toca cuatro sitios que
hoy asumen una sola cuenta: la creación del intent, el reembolso, el webhook y
Stripe.js en el navegador.

Lee antes de empezar: `lib/payments/availability.ts` completo,
`lib/stripe/client.ts`, `app/api/webhooks/stripe/route.ts`,
`lib/payments/webhook-handlers.ts`, `lib/tenancy/discover.ts`, la cabecera de la
migración `20260925000000_enable_row_level_security`, `docs/CONVENCIONES.md`,
`AGENTS.md` y `docs/PLAN-PRODUCCION.md` fase 7b.

---

## Cómo trabajar

Como siempre: **todo en inglés** salvo los documentos de planeación, **un pull
request por fase** con ramas encadenadas, autoría exclusivamente tuya, cero
emojis, y `git diff --stat main..HEAD` antes de abrir cada pull request.

```bash
gh pr list --state open
git switch main && git pull
git switch -c feature/connect-fase-0 main
```

**El criterio de este módulo:** cobrar de más se corrige con un reembolso;
cobrar a la cuenta equivocada es retención de fondos ajenos y no se corrige con
código. Cada vez que dudes entre "que funcione" y "que no pueda cobrar a la
cuenta equivocada", elige lo segundo, aunque el negocio se quede sin tarjeta un
día más.

---

## Fase 0 — Verificar el terreno (sin escribir código)

Cinco hechos. Cuatro los verifiqué yo y quiero que los confirmes contra el
código y el SDK instalado, no contra tu memoria. El quinto lo tienes que
averiguar tú.

**1. `Payment` no guarda en qué cuenta vive el intent.** El modelo tiene
`stripePaymentIntentId`, `stripeChargeId` y `stripeCustomerId`, y ninguna
columna que diga de qué cuenta de Stripe son. Hoy da igual porque siempre son de
la cuenta de la plataforma. En cuanto exista una cuenta conectada, un
`paymentIntents.retrieve` o un `refunds.create` sin `stripeAccount` fallará para
los nuevos y uno *con* `stripeAccount` fallará para los viejos. Confírmalo y di
cuántas filas de `Payment` hay hoy con `stripePaymentIntentId` no nulo.

**2. La llave publicable puede ser innecesaria.** `Business.stripePublishableKey`
lleva desde el `init` en el esquema, sin escribirse nunca. Para cargos directos,
la documentación de Stripe inicializa Stripe.js con la llave publicable **de la
plataforma** más el id de la cuenta conectada:
`loadStripe(platformKey, { stripeAccount: "acct_..." })`. Verifícalo en
`docs.stripe.com/connect/direct-charges` y en los tipos de `@stripe/stripe-js`
instalado, y di si la columna sobra.

**3. `lib/stripe/browser.ts` cachea una sola promesa.** `getStripe` guarda
`stripePromise` en una variable de módulo y la reutiliza ignorando el argumento.
Con `stripeAccount` en juego eso deja de ser una optimización y se vuelve un
error latente. Di cómo lo vas a corregir.

**4. El webhook resuelve el negocio desde la fila de `Payment`.**
`businessIdForPaymentIntent` en `lib/tenancy/discover.ts` usa `systemPrisma`, y
la migración de RLS le dio a `marea_worker` un `GRANT SELECT` por columnas sobre
`Payment` —exactamente `id`, `businessId`, `orderId`, `updatedAt`,
`stripePaymentIntentId`— y nada más. Cualquier columna nueva que el webhook
necesite leer sin sesión hay que concederla explícitamente. Confírmalo leyendo
la línea del `GRANT` y di qué columnas vas a necesitar.

**5. Lo que tienes que averiguar: qué API de cuentas corresponde usar.** La
página de cuentas Standard de Stripe hoy lleva un aviso de función obsoleta y
una instrucción explícita para agentes: usar la **API de Accounts v2**, y caer a
Accounts v1 con propiedades de `controller` sólo si v2 no soporta lo que se
necesita. El SDK instalado (`stripe@22.5.0`, versión de API fijada a
`2026-07-29.dahlia` en `lib/stripe/client.ts`) ya trae `/v2/core/accounts` y
`/v2/core/account_links`. **Verifícalo tú**, con búsquedas y con los tipos del
paquete, y trae a la Fase 1: qué API vas a usar, con qué valores exactos, y si
hay algo de lo que este módulo necesita que v2 no cubra.

No escribas código en esta fase. El commit es la nota de hallazgos en
`docs/` si hace falta, o ninguno.

---

## Fase 1 — Decisiones de alcance (para y espera respuesta)

Seis preguntas. Trae tu recomendación razonada para cada una y **para**.

### 1. El corte de los pagos que ya existen

Marea cobra hoy a la cuenta de la plataforma, que es la cuenta de su dueño. Esos
`PaymentIntent` y esos `Charge` viven ahí, no en ninguna cuenta conectada. El día
que Marea conecte su propia cuenta, todo pago nuevo nace en la cuenta conectada
y todo pago viejo sigue en la de la plataforma. Un reembolso de un pedido de la
semana pasada tiene que ir sin `stripeAccount`; uno de hoy, con él.

Trae una propuesta concreta: qué columna, qué migración, qué valor para las filas
existentes, y cómo decide en tiempo de ejecución cada llamada a Stripe si lleva
`stripeAccount` o no. Di también qué pasa si alguien conecta una cuenta y luego
la desconecta.

*Mi inclinación:* una columna en `Payment` que guarde el id de la cuenta en la
que vive el intent, nula para "la cuenta de la plataforma", puesta en el momento
de crear el intent y nunca después. La decisión se lee de la fila, no del estado
actual del negocio, que puede haber cambiado. Pero quiero tu diseño, no mi
esbozo.

### 2. ¿Cobra comisión la plataforma?

Esto es una decisión de negocio y cambia el código. En cargos directos la
plataforma puede quedarse con un `application_fee_amount` de cada pago. Si la
respuesta es no, el parámetro no se manda y el módulo es más corto. Si es sí,
hay que decidir el porcentaje, dónde vive ese número (¿columna en `Business`?
¿constante? ¿en `Organization`?), qué pasa en un reembolso, y quién paga las
comisiones de Stripe.

Las dos configuraciones no son simétricas. Con las comisiones de Stripe
cobradas a la cuenta conectada, el `application_fee_amount` es sólo la tajada de
la plataforma. Con las comisiones cobradas a la plataforma, ese monto tiene que
cubrir además la comisión de Stripe, y en México la plataforma paga MXN$35 por
cuenta conectada activa al mes, 0.25% + MXN$12 por transferencia de pago, más el
procesamiento (desde 3.6% + MXN$3 por cargo). Con precios gestionados por
Stripe no hay cuota mensual por cuenta.

Trae la comparación con números y una recomendación.

### 3. Qué tipo de cuenta conectada

De la Fase 0 punto 5. Con Accounts v2 lo que hay que fijar es
`defaults.responsibilities.fees_collector`, `defaults.responsibilities.losses_collector`
y `dashboard`; `requirements_collector` ya no se fija, se deriva. Con Accounts v1
los equivalentes son `controller.fees.payer`, `controller.losses.payments`,
`controller.requirement_collection` y `controller.stripe_dashboard.type`.

Lo que este sistema necesita: el restaurante es el comerciante de registro, ve
sus propios cobros, atiende sus propias disputas, y **la plataforma no responde
por saldos negativos ajenos**. Marea no tiene equipo de riesgo. Eso apunta a
`losses_collector: stripe` y `dashboard: full`, que es además lo que Stripe
recomienda por defecto para una plataforma SaaS nueva. Recuerda que el tipo de
tablero es inmutable: cambiarlo obliga a crear una cuenta nueva.

Hay un argumento extra por v2 que conviene poner sobre la mesa: un mismo
`Account` puede llevar la configuración de comerciante y la de cliente, lo que
significa que la suscripción mensual que el módulo 18 tiene que cobrar al
restaurante puede colgar del mismo objeto en vez de exigir un `Customer`
paralelo y un mapa entre ambos. Si es cierto, decidirlo aquí ahorra trabajo allá.

Verifica, recomienda y para.

### 4. Cómo se da de alta la cuenta

¿Enlace de onboarding alojado por Stripe al que se redirige desde
`/admin/configuracion`, o componentes embebidos dentro del panel? Lo primero es
una llamada y una redirección; lo segundo es más trabajo y no saca al
restaurantero del producto.

Decide también qué pasa cuando vuelve: el `return_url` no garantiza que haya
terminado, y hay que releer la cuenta para saber si puede cobrar de verdad.
Y qué pasa con el `refresh_url`, que se visita si el enlace caducó o ya se usó.

*Mi inclinación:* alojado por Stripe en este módulo, embebido como mejora
posterior si el onboarding resulta ser un punto de fricción real. El módulo ya
es grande.

### 5. Qué significa "puede cobrar con tarjeta"

Hoy `canTakeOnlinePayments` responde sí en cuanto hay un `stripeAccountId`. Eso
va a ser insuficiente: una cuenta recién creada tiene un id y no puede cobrar
nada hasta que pase verificación, y una cuenta verificada puede quedar
restringida después. La capacidad de cobro con tarjeta tiene estados —activa,
pendiente, restringida, no soportada— y el id por sí solo no dice en cuál está.

Trae: qué campo se guarda en `Business`, cuándo se refresca, qué ve el
restaurantero en cada estado, y qué ve el comensal. Un comensal que llega a la
pantalla de pago y recibe un error de Stripe es peor que uno que ve "paga en
caja" desde el principio.

### 6. El webhook de Connect

Los eventos de cargos directos llegan a un endpoint distinto del actual, con su
**propio secreto de firma**, y traen un campo `account` de primer nivel con el id
de la cuenta conectada. El endpoint de hoy (`app/api/webhooks/stripe/route.ts`)
seguirá recibiendo lo de la plataforma.

Decide: ¿un endpoint nuevo, o uno solo que pruebe las dos firmas? ¿Qué eventos de
Connect hay que atender además de los de pago —cambios de estado de la cuenta,
desconexión de la plataforma? Y lo importante: **cómo se garantiza que un evento
de la cuenta X no puede aplicarse a un negocio distinto de X.** Hoy el negocio se
deriva de la fila de `Payment`; con Connect hay dos fuentes y tienen que
coincidir.

**Para aquí.**

---

## Fase 2 — El esquema y el corte

Lo decidido en la pregunta 1, más lo que haga falta de las preguntas 2 y 5.

Una migración escrita a mano o generada, como corresponda, que:

- Añada a `Payment` la columna que marca en qué cuenta vive el intent, con el
  valor correcto para las filas que ya existen.
- Añada a `Business` lo que la pregunta 5 haya decidido sobre el estado de la
  capacidad de cobro.
- Conceda a `marea_worker` un `GRANT SELECT` por columnas sobre cualquier columna
  nueva que el webhook necesite leer sin sesión, en el mismo estilo que la
  migración de RLS existente. Sin eso el webhook falla en producción y no en las
  pruebas, que es la peor combinación.
- Quite `Business.stripePublishableKey` si la Fase 0 confirmó que sobra. Si se
  queda, el comentario tiene que decir para qué, y tiene que ser verdad.

Una función de descubrimiento en `lib/tenancy/discover.ts` que responda "¿de qué
negocio es esta cuenta de Stripe?" con `systemPrisma`, en el mismo estilo y con
el mismo comentario de justificación que las que ya están ahí: por qué es seguro
que el rol de sistema vea eso y nada más.

Commits por pieza: la migración, el cliente de Prisma, la función de
descubrimiento.

---

## Fase 3 — Dar de alta la cuenta

El flujo completo, en `/admin/configuracion`, para `BUSINESS_ADMIN` y arriba:

- Crear la cuenta conectada con los valores de la pregunta 3.
- Generar el enlace de onboarding y redirigir.
- Manejar el regreso: releer la cuenta, guardar el estado real, y dejar claro en
  pantalla si falta algo.
- Manejar el `refresh_url` generando un enlace nuevo con los mismos parámetros.

Tres reglas que no se negocian:

1. **El id de la cuenta no se acepta de un formulario, nunca.** Sólo lo escribe
   el código que acaba de crear la cuenta, o el que lee la cuenta desde Stripe.
   Un campo de texto donde un administrador escriba `acct_...` es una vía para
   mandar el dinero de su negocio a una cuenta que no es suya, o para apuntar
   dos negocios a la misma cuenta. Si el diseño lo permite, el diseño está mal.
2. **Un negocio, una cuenta.** La columna tiene que ser única, y el error de
   unicidad tiene que traducirse a algo legible, no a un 500.
3. **Activar el cobro con tarjeta sigue pasando por el servidor.** El candado de
   `lib/settings/actions.ts` y el de `lib/payments/stripe-actions.ts` no se
   relajan: se vuelven más finos. Lo que hoy pregunta "¿hay id?" pasa a preguntar
   "¿puede cobrar?".

Commits por pantalla y por acción.

---

## Fase 4 — Cobrar a la cuenta del negocio

El corazón del módulo. Toda llamada a Stripe que hoy va implícita a la cuenta de
la plataforma tiene que decidir explícitamente a qué cuenta va.

En el servidor, las que encontré leyendo el código —confirma la lista y
complétala:

- `lib/payments/stripe-actions.ts`: `paymentIntents.create`,
  `paymentIntents.retrieve`, `paymentIntents.update`, `paymentIntents.cancel`.
- `lib/payments/webhook-handlers.ts`: `charges.retrieve` en
  `resolveChargeDetails`, `refunds.list` en `resolveRefundsForEvent`.
- `lib/payments/refund-actions.ts`: `refunds.create`.

No repartas `stripeAccount` a mano en cada llamada. `lib/stripe/client.ts` es hoy
un proxy perezoso de una sola instancia por una razón buena (que Docker
construya sin el secreto) y esa razón sigue valiendo. Diseña la forma de obtener
"el cliente de Stripe para este negocio" de manera que **olvidar el
`stripeAccount` sea difícil o imposible**, no una convención que se recuerda. Si
puedes hacer que el compilador lo exija, mejor que un comentario.

En el navegador, `lib/stripe/browser.ts` y sus dos llamadores
(`components/order/CardPaymentPanel.tsx`, `components/order/PaymentSection.tsx`,
que reciben la llave desde `app/o/[publicToken]/page.tsx`). La caché de una sola
promesa tiene que dejar de ignorar sus argumentos.

Lo que hay que preservar tal cual está, porque ya es correcto:

- El monto se lee de la base, nunca del cliente.
- La llave de idempotencia derivada del pedido y del monto, con el razonamiento
  que el comentario explica. Las llaves de idempotencia de Stripe viven por
  cuenta, así que el esquema actual sigue sirviendo; dilo en el comentario si es
  así, para que nadie lo "arregle" después.
- El estado `SUCCEEDED` lo pone el webhook y nadie más.

Pruebas: que un negocio con cuenta conectada cobre a su cuenta, que un negocio
sin cuenta no pueda cobrar, y que **un pago de un negocio no pueda reembolsarse
ni consultarse con las credenciales del otro.** Esa última es la que importa.

---

## Fase 5 — Reembolsos y la comisión

Si la pregunta 2 se respondió con comisión, hay un detalle que cuesta dinero
real: **la comisión de la plataforma no se devuelve sola cuando se reembolsa un
pago.** Si el reembolso no la devuelve explícitamente, quien pierde ese monto es
el restaurante, no la plataforma. Un reembolso total devuelve la comisión
completa; uno parcial, la parte proporcional.

Eso significa que `refundOnePayment` en `lib/payments/refund-actions.ts` tiene
que mandar el parámetro correspondiente, y que hay que decidir la política y
escribirla en el comentario: *la plataforma devuelve su comisión en cada
reembolso*, o *no la devuelve y el restaurante lo sabe porque está en el
contrato*. Lo segundo es defendible, pero tiene que ser una decisión escrita, no
un parámetro olvidado.

El camino de efectivo (`refundCashPayment`) no cambia: no hay cuenta de Stripe en
juego. Que siga sin tocarse y que las pruebas lo demuestren.

---

## Fase 6 — El webhook de Connect

Lo decidido en la pregunta 6.

Lo que tiene que quedar cierto al terminar, sea un endpoint o dos:

- La firma se verifica contra el secreto que corresponde al origen del evento.
  Un evento de Connect firmado con el secreto de la plataforma no se acepta, ni
  al revés.
- El negocio se resuelve de forma que **el campo `account` del evento y el
  negocio de la fila de `Payment` tengan que coincidir**. Si no coinciden, el
  evento no se aplica: se registra y se responde 2xx, porque reintentarlo no lo
  va a arreglar, pero no se toca ninguna fila. Un evento que puede aplicar un
  cobro al negocio equivocado es el fallo más caro que este sistema puede tener.
- La idempotencia por `eventId` se mantiene. `StripeWebhookEvent` es una tabla de
  plataforma, fuera de RLS a propósito (la cabecera de la migración lo dice), y
  los ids de evento son únicos globalmente, así que el índice único sigue
  sirviendo con dos endpoints. Confírmalo en vez de asumirlo.
- Los eventos de estado de la cuenta actualizan lo que la pregunta 5 haya
  decidido guardar. Una cuenta que queda restringida tiene que dejar de ofrecer
  tarjeta sin que nadie entre a la configuración.
- Una cuenta que se desconecta de la plataforma deja de poder cobrar. Sin
  excepción y sin intervención manual.
- El manejador sigue respondiendo rápido y sigue respondiendo 2xx salvo firma
  inválida, por la razón que el comentario de cabecera explica: un 500 mete a
  Stripe en un bucle de reintentos.

Pruebas de integración con eventos firmados de las dos clases, incluido el caso
del evento cuya cuenta no corresponde al negocio.

`docs/DEPLOY.md` tiene que decir qué endpoints hay que registrar, con qué
alcance, y qué variables de entorno nuevas existen. Un despliegue en el que sólo
se configuró un secreto tiene que fallar de forma legible, no silenciosa.

---

## Fase 7 — Cierre

- `docs/PLAN-PRODUCCION.md`: fila 7b de la tabla de estado, y la casilla de la
  lista de pendientes.
- `docs/DEPLOY.md`: variables nuevas, endpoints, y el procedimiento de alta de un
  restaurante con cuenta propia.
- Obsidian, en `04-Proyectos-Verticales/Marea-Bitacora/`, siguiendo la plantilla
  de `09-Plantillas/Plantilla-Nota-de-Bitacora`: qué cambió para el
  restaurantero, no qué cambió en el código.
- El pull request final a `main`, con `git diff --stat main..HEAD` antes.

---

## Reglas técnicas

Estas las verifiqué contra la documentación de Stripe y contra el SDK instalado.
Si al implementar encuentras que alguna es falsa o quedó obsoleta, **dilo y trae
la fuente**; no la sigas por respeto al prompt.

- **Cargos directos, no de destino ni separados.** El restaurante es el
  comerciante de registro: el cargo aparece en su cuenta, su saldo sube con cada
  pago, y las disputas son suyas. Es la configuración que corresponde a una
  plataforma SaaS, y es la que hace que la plataforma no esté reteniendo fondos
  ajenos, que es el problema que este módulo existe para resolver.
- **Los objetos viven en la cuenta conectada.** `PaymentIntent` y `Charge` de un
  cargo directo no existen a nivel de plataforma. Cualquier consulta sobre ellos
  va autenticada como la cuenta conectada. Esto es lo que rompe las seis llamadas
  de la Fase 4.
- **Stripe.js:** `loadStripe(llavePublicableDeLaPlataforma, { stripeAccount })`.
  La llave es la de la plataforma; lo que cambia es el `stripeAccount`. Verifica
  que la versión instalada de `@stripe/stripe-js` lo acepta así.
- **La comisión de la plataforma no se reembolsa sola.** Fase 5.
- **Los estados de la capacidad de cobro con tarjeta son cuatro**, no dos. Un id
  de cuenta no es permiso para cobrar.
- **Los eventos de cuentas conectadas traen `account`** y llegan a un endpoint con
  su propio secreto de firma.
- **Modo de prueba y modo real son cuentas distintas.** Un id de cuenta de
  sandbox no sirve en producción. Comprueba si eso obliga a algo en el esquema o
  si basta con que cada entorno tenga su base; di cuál de las dos y por qué.
- **`stripe@22.5.0`, versión de API `2026-07-29.dahlia`.** No subas ninguna de
  las dos en este módulo. Si algo que necesitas exige una versión distinta, para
  y dilo: cambiar la versión de API cambia formas de respuesta en todo el
  sistema y no es parte de este trabajo.

Y las de siempre: TypeScript estricto sin `any`, Server Actions como única
superficie de mutación salvo los manejadores de ruta que ya existen, comentarios
cortos que expliquen **por qué** y no qué, y ningún secreto en el repositorio.

---

## Definición de terminado

- Un negocio puede conectar su cuenta de Stripe desde el panel, sin que nadie
  toque la base ni el entorno.
- El dinero de cada negocio llega a la cuenta de ese negocio. Hay una prueba que
  lo demuestra con dos negocios y dos cuentas.
- Un pago de un negocio no se puede consultar ni reembolsar con las credenciales
  de otro. Hay una prueba que lo intenta y falla.
- Los pagos anteriores al corte se siguen pudiendo reembolsar. Hay una prueba.
- Un negocio sin cuenta, o con una cuenta que no puede cobrar todavía, muestra
  "paga en caja" y no una pantalla de tarjeta que va a fallar.
- Una cuenta restringida o desconectada deja de ofrecer tarjeta sin intervención
  manual. Hay una prueba.
- Los dos orígenes de webhook verifican su firma y ninguno puede aplicar un
  evento al negocio equivocado. Hay una prueba del caso cruzado.
- La suite completa pasa. `npm run lint`, `tsc --noEmit`, unitarias, integración
  y e2e.
- `docs/DEPLOY.md` permite dar de alta un restaurante con cuenta propia
  siguiendo el documento y nada más.
- El candado de `lib/payments/availability.ts` sigue existiendo, más fino: ya no
  bloquea por "no hay cuenta", bloquea por "esta cuenta no puede cobrar".

---

## Lo que NO debes hacer

- **No borres el candado de `availability.ts`.** No es un obstáculo que este
  módulo remueve, es la regla que este módulo hace cumplible.
- **No aceptes un id de cuenta desde un formulario.** Fase 3, regla 1.
- **No hagas cargos de destino ni cargos y transferencias separadas.** Meterían a
  la plataforma en el camino del dinero, que es exactamente lo que se está
  evitando.
- **No subas la versión de la API de Stripe ni la del SDK.**
- **No toques el camino de efectivo.** `refundCashPayment`, la caja, los cortes de
  turno: nada de eso tiene cuenta de Stripe.
- **No cambies la llave de idempotencia de los intents ni de los reembolsos** sin
  explicar por qué el razonamiento que está en los comentarios dejó de valer.
- **No marques `SUCCEEDED` desde ningún sitio que no sea el webhook.**
- **No sigas si hay un pull request abierto**, y no encadenes una rama sin haber
  comprobado antes qué trae de más con `git diff --stat main..HEAD`.
- **Cero emojis**, en el código, en los commits, en los pull requests y en
  Obsidian.

---

## Cómo trabajar

Fase 0 y para en la Fase 1. No empieces la Fase 2 sin las seis respuestas: cinco
son de diseño y una, la primera, decide si los pagos que ya existen se pueden
seguir reembolsando.
