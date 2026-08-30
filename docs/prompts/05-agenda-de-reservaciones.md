# Prompt para Claude Code — Módulo 5: cierre de reservaciones y agenda del panel

> Pégalo completo en `Desktop/restaurant-page`, sobre la misma rama
> `feature/reservations` que ya traes empezada. Se ejecuta con el skill
> `build-loop-claude-code`. **Para al final de la Fase 1** a esperar aprobación
> del diseño de la agenda.

---

Continúas donde te quedaste: la Fase 1 de cobros, la disponibilidad y todo el
circuito público del cliente ya están arriba y se ven bien. Falta la agenda del
panel, y hay ocho cosas que cerrar antes o durante.

La primera es la pregunta que hiciste, y la respuesta es sí.

---

## La decisión que pediste: `confirmationCode` pasa a `cuid(2)`

**Cámbialo.** Tenías razón en parar a preguntar —la regla del módulo dice que
un cambio de esquema se consulta— y también en el diagnóstico. Cuatro razones,
en orden de peso:

1. **El esquema ya tomó esta decisión y no se la aplicó a sí mismo.** El
   comentario de `Order.publicToken` explica en siete renglones por qué `cuid()`
   es CUID v1, estructurado y malo como token público sin auth, y por qué usa
   `cuid(2)` — y cierra diciendo *"Es el mismo patrón que
   `Reservation.confirmationCode`"*. Sólo que `confirmationCode` quedó en
   `cuid()`. No estás proponiendo un criterio nuevo: estás terminando de aplicar
   uno que el propio documento ya dio por sentado.
2. **El caso es más grave, no menos.** Adivinar un `publicToken` te deja *ver* el
   pedido de alguien más. Adivinar un `confirmationCode` te deja **cancelarle la
   reservación**. El token con el poder destructivo es justamente el que quedó
   con el generador predecible.
3. **No hay migración.** Verifícalo tú mismo: `@default(cuid())` lo genera Prisma
   Client, no Postgres — en `20260823102124_init/migration.sql` la columna es un
   `TEXT NOT NULL` pelón, sin `DEFAULT`. Cambiar el atributo no produce una sola
   línea de SQL; `prisma migrate dev` va a reportar que no hay cambios. La regla
   de "para y pregunta" existe para cambios estructurales, y esto no lo es.
4. **Los códigos ya emitidos se quedan en v1.** Hoy sólo hay datos de desarrollo,
   así que no hay nada que rotar. Si algún día hubiera reservaciones reales con
   códigos v1, la respuesta sería rotarlos, no dejarlos.

Va en su propio commit, con el comentario del esquema actualizado para que la
próxima persona no tenga que reconstruir este razonamiento. Y de paso corrige el
comentario de `publicToken`: la frase "es el mismo patrón que
`Reservation.confirmationCode`" sólo será cierta después de este commit.

---

## Cómo trabajar: rama y commits

Sigues en `feature/reservations`. Las mismas reglas, que hasta ahora has
respetado bien —24 commits en la rama, ninguno cerca del techo—:

- Asunto en inglés, imperativo, ≤72 caracteres, una sola preocupación.
- **Cuerpo del mensaje conciso, máximo 3 líneas**, y sólo cuando el *porqué* no
  se deduce del diff.
- **En ningún commit, comentario, documento ni PR se menciona con qué
  herramienta se escribió el código.** Sin `Co-authored-by` de asistentes, sin
  "generado con", sin firmas al pie.
- Techo de ~400 líneas o ~8 archivos por commit.
- Nunca mezclar refactor con cambio de comportamiento.
- Sube al terminar cada fase. Nada de `--amend` ni force-push sobre lo subido.

**Empieza por commitear lo que ya tienes en el árbol.** Hay ocho archivos
modificados sin commitear (reutilizar `ConfirmDialog`, el `ReservationStatusBadge`,
la guarda de `updateMany` en la cancelación, `loadAvailabilityForDay` recibiendo
el `business` ya resuelto). Es trabajo bueno y no debería seguir suelto: pártelo
en dos o tres commits por preocupación antes de tocar nada nuevo.

Y **versiona los prompts**: `docs/prompts/03-cobros-y-stripe.md`,
`04-reservaciones.md` y este mismo siguen sin commitear, igual que
`scripts/graphify-to-obsidian.mjs` y `.graphifyignore`. Si los prompts son el
registro de cómo se construyó esto, no pueden vivir sólo en el disco.

---

## Fase 0 — Los siete pendientes de la revisión

Además del `cuid(2)` de arriba. Cada uno su commit.

**0.1 — El circuito público de reservaciones no tiene límite de tasa.**
`createReservationAction` no pide cuenta, no verifica el correo ni el teléfono y
no tiene tope: cualquiera puede llenar la agenda del restaurante con
reservaciones falsas en un minuto y dejarlo sin mesas que vender un viernes.
Es el mismo hueco que quedó abierto en `createPaymentIntentAction`, pero aquí el
daño no necesita adivinar nada. Y del otro lado, `/r/[confirmationCode]` y
`cancelReservationByCodeAction` permiten probar códigos sin freno —con `cuid(2)`
el espacio vuelve impráctico el ataque, pero un límite de tasa no depende de que
el token sea largo. Reutiliza el patrón de ventana deslizante de
`lib/auth/rate-limit.ts` (por IP, con `getClientIp`); no inventes un segundo
mecanismo.

**0.2 — Se puede reservar para dentro de dos minutos.** `getAvailableSlots` sólo
descarta `startsAt <= now`, mientras que cancelar exige `MIN_CANCEL_LEAD_MINUTES
= 120`. La asimetría no tiene defensa: un restaurante que te deja apartar mesa
para dentro de dos minutos pero no cancelarla con hora y media de anticipación
está al revés. Fija un `MIN_BOOKING_LEAD_MINUTES` junto al otro, con el mismo
comentario que explique que es decisión de negocio y no una constante derivada.
Si crees que ambos deberían vivir en `Business` en vez de en el código —que es
la respuesta correcta a mediano plazo— **para y pregúntame**: eso sí es cambio de
esquema.

**0.3 — No hay tope de horizonte.** `getReservationSlotsAction` acepta cualquier
fecha válida, incluido el año 2030, y hace las cuatro consultas del día para
contestar una lista vacía. Pon un horizonte máximo (90 días es lo común) y
recházalo en el schema de Zod, no en la acción.

**0.4 — El `time` no identifica un slot cuando el negocio cierra después de
medianoche.** `minutesToHHMM` normaliza módulo 1440, así que un slot en el minuto
1470 se etiqueta `"00:30"` — exactamente igual que un slot en el minuto 30 de
una ventana de madrugada del mismo día. `findSlot` devuelve el primero que
coincida, o sea que puede reservar el instante equivocado. Hoy Marea no abre
después de medianoche, pero el módulo declara soportarlo en tres comentarios
distintos y el test lo cubre. O el slot viaja con su `minutesFromMidnight` y
`findSlot` compara contra eso, o la colisión se detecta y se rechaza. Lo que no
puede quedarse es la coincidencia silenciosa.

**0.5 — El esquema dice que la mesa se asigna al confirmar; el código la asigna
al crear.** El comentario de `Reservation.tableId` dice *"se asigna al confirmar,
puede quedar `null` mientras tanto"*. `createReservationAction` la asigna desde
`PENDING`, y hace bien: en una `EXCLUDE` constraint un `tableId` nulo no choca
con nada, así que una reservación sin mesa no reserva nada en absoluto. El código
tiene razón y el comentario quedó viejo — actualízalo, y ten presente la
consecuencia para la Fase 2: confirmar no *asigna* mesa, a lo más la **reasigna**,
y reasignar tiene que pasar por la misma verificación de solapamiento.

**0.6 — Nadie ha visto pasar las pruebas.** `lib/reservations/availability.test.ts`
son 203 líneas sobre la única pieza del módulo que se paga con una mesa vendida
dos veces, y `npm test` no arranca desde una terminal Linux porque
`node_modules/@rolldown/` sólo trae el binding de `win32-x64-msvc`. Corre
`npm test` en Windows y **pégame la salida**. Si falla algo, eso va antes que
cualquier cosa de este prompt.

**0.7 — Cierra el `TIME_SLOTS` muerto.** Confirma que `content.ts` ya no exporta
la constante vieja de horarios y que nada la importa. Si quedó, bórrala: era
explícitamente parte del encargo anterior.

---

## Fase 1 — Diseño de la agenda (para y espera aprobación)

No es un kanban. Una reservación no avanza por columnas: se lee por hora, de un
vistazo, por alguien que está de pie en la entrada con gente esperando enfrente.

Diseña la agenda del día: franjas horarias en orden, y en cada una las
reservaciones con `partySize`, nombre, mesa asignada y estado. La densidad es la
del tablero de pedidos, no la del panel de menú — se lee a distancia. Los seis
valores de `ReservationStatus` ya tienen dónde caer en la paleta semántica; no
inventes tokens, igual que no hicieron falta para los ocho de `PaymentStatus`.

Piensa dos estados que la lista feliz no tiene: el día sin ninguna reservación
(que es la mayoría de los lunes y no debe verse como un error) y la reservación
cuya hora ya pasó sin que nadie la sentara — que es justo la que necesita saltar
a la vista, porque es la que se va a marcar `NO_SHOW`.

Propón, enséñame y **para aquí**.

---

## Fase 2 — La agenda funcionando

La matriz de permisos ya lo dice y no se reinventa: **`STAFF` confirma
reservaciones, las sienta (`SEATED`), las completa y las marca `NO_SHOW`**;
**cancelar es de `BUSINESS_ADMIN`**, igual que cancelar un pedido y por la misma
razón — es la acción que le quita algo al cliente.

Como en pedidos, una máquina de estados explícita en su propio módulo
(`lib/reservations/state-machine.ts`, con la misma forma que
`lib/payments/state-machine.ts`): `PENDING → CONFIRMED | CANCELLED`,
`CONFIRMED → SEATED | NO_SHOW | CANCELLED`, `SEATED → COMPLETED`, y `COMPLETED`,
`CANCELLED`, `NO_SHOW` terminales. Ninguna acción escribe un estado sin pasar
por ahí.

Bloquea la fila antes de leer su estado, con el mismo `FOR UPDATE` que
`lockOrderForUpdate` ya usa en `board-actions.ts` — dos tabletas mirando la
misma agenda son el caso normal, no el raro.

Reasignar mesa al confirmar es opcional para el staff, pero cuando lo haga tiene
que pasar por la disponibilidad real y atrapar la violación de la `EXCLUDE`
constraint igual que lo hace la creación: mismo error legible, nunca un 500.

`SEATED` es el punto donde tocaría mover `RestaurantTable.status` a `OCCUPIED`.
**No lo hagas todavía y dime por qué te parece.** Hoy nada más escribe ese campo;
si esta fase empieza a moverlo sin que el circuito del pedido lo lea ni lo
libere, queda un dato que envejece solo y miente a la primera mesa que no se
marque libre — peor que no tenerlo.

La agenda vive bajo el shell del panel, en `/admin/reservaciones`, con la misma
i18n por cookie (`marea-lang`) y el diccionario partido por sección que ya usan
pedidos y menú. Agrégala a la navegación de `AdminShell`.

---

## Fase 3 — Cierre

1. `graphify` y luego
   `node scripts/graphify-to-obsidian.mjs --out "<vault>/04-Proyectos-Verticales/Marea-Codigo"`.
2. `lib/reservations/` tiene que aparecer como módulo propio y **sin una sola
   arista hacia `lib/payments/`**: reservar y cobrar no se tocan en v1, y si el
   grafo dice lo contrario es que algo se filtró.
3. Revisa "Conexiones que cruzan módulos". Cualquier arista nueva que no
   esperabas es una dependencia que se te coló.
4. Abre el PR de `feature/reservations` contra `main`. Descripción concisa: qué
   circuito queda cerrado y qué quedó fuera a propósito. Sin menciones de
   herramientas.

---

## Reglas técnicas

Las de siempre: Server Components por defecto · mutaciones con Server Actions
validadas con Zod · `Prisma.Decimal` nunca cruza a un Client Component ·
`deletedAt: null` en todo query de catálogo · `businessId` siempre desde
`getCurrentBusiness()` · `requireRole()` en la primera línea de cada mutación ·
todo lo que toque estado va en transacción · el servidor no confía en el cliente
para disponibilidad ni permisos · sin librerías de UI nuevas · accesible con
teclado y AA · build y lint limpios, sin `any` ni `@ts-ignore`.

Las tres del módulo, que siguen vigentes:

- **Ninguna fecha se interpreta en el cliente.** El servidor resuelve contra la
  zona horaria del negocio. Nada de `new Date(string)` sobre entrada del usuario
  en un componente — tampoco en la agenda del panel.
- **Ninguna disponibilidad se calcula dos veces.** `availability.ts` es la única
  fuente, también para la reasignación de mesa de la Fase 2.
- **La `EXCLUDE` constraint es la última palabra**, no la validación previa.

---

## Definición de terminado

- [ ] `confirmationCode` usa `cuid(2)` y el comentario del esquema lo explica.
- [ ] `npm test` pasa en Windows y me pegaste la salida.
- [ ] Un guion de 200 peticiones seguidas al crear reservación se topa con el
      límite de tasa en vez de llenar la agenda.
- [ ] No puedo reservar para dentro de diez minutos.
- [ ] No puedo pedir horarios para dentro de dos años.
- [ ] Un `STAFF` confirma, sienta y marca `NO_SHOW`, pero no puede cancelar.
- [ ] Dos tabletas confirmando la misma reservación al mismo tiempo: una gana,
      la otra recibe un error legible.
- [ ] Reasignar a una mesa ya ocupada en ese rango da "ese horario se acaba de
      ocupar", no un 500.
- [ ] El día sin reservaciones se ve intencional, no roto.
- [ ] Las notas de Obsidian muestran `lib/reservations/` como módulo propio sin
      aristas hacia `lib/payments/`.
- [ ] Los prompts y `scripts/` están commiteados.
- [ ] Ningún commit pasa de ~400 líneas, ningún cuerpo pasa de 3 líneas, y
      ninguno menciona con qué se escribió.

---

## Lo que NO debes hacer

- Promociones, testimonios, mesas/QR, reportes, dashboard de métricas, worker de
  notificaciones (sigue siendo sólo encolar).
- Cobrar depósito por reservación. Reservar y cobrar no se tocan en v1.
- Lista de espera, recordatorios automáticos, reprogramar desde el cliente.
- Mover `RestaurantTable.status` — ver la Fase 2.
- Cambiar el esquema más allá del `cuid(2)` autorizado arriba. Si crees que
  `MIN_BOOKING_LEAD_MINUTES` debe vivir en `Business`, **para y pregúntame**.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase y
`/security-review` en la Fase 0 — es la que toca el token público y el límite de
tasa. **Para al final de la Fase 1** y espera el visto bueno del diseño; después
avanza de corrido, subiendo la rama y reportando al cerrar cada fase.
