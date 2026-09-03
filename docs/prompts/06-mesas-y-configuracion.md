# Prompt para Claude Code — Módulo 6: mesas, QR y configuración del negocio

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code` y **para al final de la Fase 1** a esperar aprobación
> del diseño.

---

Reservaciones quedó bien: la máquina de estados, el bloqueo de fila, la
reasignación de mesa pasando por la misma disponibilidad y dejando que la
`EXCLUDE` constraint tenga la última palabra. Diez cosas que corregir, tres de
ellas de verdad importantes, y después el módulo que hace que todo esto se pueda
encender en un restaurante real.

Porque hoy no se puede. Tres circuitos terminados leen `RestaurantTable`
—el QR que abre el menú, el filtro "por mesa" del tablero, la mesa que asigna una
reservación— y **no existe una sola pantalla para crear una mesa**. Reservaciones
no funciona sin filas de `OpeningHour`, y tampoco hay pantalla para eso. La única
forma de encender un restaurante hoy es editar `prisma/seed.ts` a mano. Eso es lo
que cierra este módulo.

Lee antes de empezar: `AGENTS.md` (**Next.js 16 — el middleware se llama
`proxy.ts`; lee `node_modules/next/dist/docs/`**), `docs/DATABASE.md`,
`docs/product/roles-y-alcance.md` y `docs/design.md`.

---

## Cómo trabajar: rama y commits

**Rama.** `feature/tables-and-settings`, partida de un `main` **ya actualizado**
—con `feature/reservations` fusionada— siguiendo la Fase 0 de siempre:

```bash
git switch main && git pull
git log --oneline main..feature/reservations | wc -l   # tiene que dar 0
git switch -c feature/tables-and-settings
git fetch --prune
git branch --merged main | grep -v '^\*\| main$' | xargs -r git branch -d
```

Si el conteo no da 0, **para y dime** qué quedó fuera.

**Commits.** Las mismas reglas, que vienes cumpliendo:

- Asunto en inglés, imperativo, ≤72 caracteres, una sola preocupación.
- **Cuerpo conciso, máximo 3 líneas**, y sólo cuando el *porqué* no se deduce del
  diff.
- **En ningún commit, comentario, documento ni PR se menciona con qué
  herramienta se escribió el código.** Sin `Co-authored-by` de asistentes, sin
  "generado con", sin firmas al pie.
- Techo de ~400 líneas o ~8 archivos. Nunca refactor mezclado con
  comportamiento. Un cambio de esquema va solo con su migración.
- Sube al terminar cada fase. Nada de `--amend` ni force-push sobre lo subido.

---

## Fase 0 — Los diez hallazgos de la revisión

Cada uno su commit. Los primeros cuatro son los que importan.

**0.1 — `qrToken` sigue en `cuid()`. Es la tercera vez.** Arreglamos
`Order.publicToken`, luego `Reservation.confirmationCode`, y
`RestaurantTable.qrToken` quedó igual — y es el más expuesto de los tres: quien
lo tiene abre el menú de esa mesa y pide a su cuenta. Peor todavía, las mesas se
crean **en lote** ("M-01" a "M-12" de un jalón, o el seed entero), que es
exactamente el caso donde CUID v1 es más débil: ids consecutivos generados con
milisegundos de diferencia. Mismo arreglo de una línea, misma ausencia de SQL
(`@default(cuid())` lo genera Prisma Client, no Postgres).

Y como ya van tres, **escribe la regla donde se vea**: en el encabezado de
`schema.prisma` o en `AGENTS.md`, una línea que diga que ningún token público de
capacidad usa `cuid()`. `Cart.sessionToken` ya la cumple con un CSPRNG y su
comentario lo explica; que la próxima persona no tenga que descubrirlo por
cuarta vez.

**0.2 — Cualquier login en el sistema evade el límite de reservaciones.**
`recordLoginAttempt` termina con un `deleteMany` cuyo `OR` tiene una segunda rama
`{ createdAt: { lt: now - WINDOW_MS } }` **sin filtrar por email ni por scope** —
borra cualquier fila de `LoginAttempt` con más de 15 minutos. Pero el limitador
de creación de reservaciones vive en esa misma tabla con una ventana de **60
minutos**. Resultado: el límite de "5 por hora" en realidad dura 15 minutos, y
cualquier persona intentando entrar al panel se lo reinicia a todo el mundo. O
el borrado se filtra por scope, o los scopes tienen su propia limpieza; lo que
no puede es que dos mecanismos se pisen la tabla.

**0.3 — El límite castiga al cliente honesto justo la noche llena.**
`recordScopeAttempt` se llama **antes** de verificar disponibilidad, así que un
intento que falla porque el horario se acaba de ocupar consume cuota igual que
uno que sí reservó. Con 5 por hora, alguien que choca tres veces un viernes
—que es literalmente el caso que el módulo anterior llamó "el real, no el
excepcional, en un restaurante lleno"— se queda una hora sin poder reservar.
Cuenta las reservaciones **creadas**, no los intentos; o dale al presupuesto de
intentos un número mucho más alto que al de creaciones.

**0.4 — Una reservación `PENDING` vencida no tiene salida.**
`isReservationOverdue` marca como vencidas tanto `PENDING` como `CONFIRMED`, la
fila se pinta en ámbar y el contador "vencidas" la suma. Pero
`LEGAL_TRANSITIONS.PENDING` es `["CONFIRMED", "CANCELLED"]`: no incluye
`NO_SHOW`. Así que el `STAFF` mira una fila que le grita que actúe y su única
opción es "Confirmar" una reservación cuya hora ya pasó — cancelar es de admin.
Decide: o `PENDING → NO_SHOW` es una transición legal (que es lo que creo, un
cliente que reservó y no llegó no dejó de ser un no-show por que nadie alcanzara
a confirmarlo), o una `PENDING` vencida no debería contarse como vencida. Las
dos son defendibles; la mezcla actual no.

**0.5 — La agenda esconde reservaciones cuando cambia el horario.**
`app/admin/(shell)/reservaciones/page.tsx` filtra las filas del día con
`isMinuteWithinWindows` contra los `OpeningHour` vigentes. Si alguien edita o
borra un horario después de que ya había reservas —que es exactamente lo que va
a pasar en cuanto la Fase 3 de este módulo exista— esas reservas **desaparecen
de la agenda** aunque sigan existiendo, siguen bloqueando su mesa y siguen
esperando a alguien en la puerta. Un lunes marcado como cerrado muestra agenda
vacía con reservaciones cargadas debajo. El filtro está resolviendo un problema
real (separar "esta noche" de "la madrugada del día siguiente" en una ventana de
48 horas), pero una pantalla de operación no oculta filas por una regla de
catálogo: resuélvelo por rango de tiempo, no por pertenencia a una ventana
vigente.

**0.6 — La mesa sólo se puede reasignar en el instante de confirmar.**
`confirmReservationAction` es la única acción que acepta `tableId` y el selector
sólo se pinta en filas `PENDING`. Una mesa que se rompe, un grupo que crece de 4
a 6, una reservación ya confirmada que hay que mover: no hay forma. Y el
selector ofrece todas las mesas activas, incluidas las que no caben (el servidor
contesta `table_too_small`) y las que ya están ocupadas en ese rango
(`table_taken`), así que el staff lo averigua a base de intentos fallidos frente
al cliente. Filtrar por asientos es aritmética, no disponibilidad — hazlo. Lo
demás sigue siendo del servidor.

**0.7 — La agenda no se entera de nada sola.** El tablero de pedidos tiene SSE
(`useEventStream`); la agenda depende de `revalidatePath`. Dos tabletas en la
entrada ven estados distintos hasta que una de las dos actúa. Decide si vale la
pena colgarla del stream que ya existe o si el caso no lo amerita, y **dímelo
con tu razón** — no lo hagas sin más, es alcance.

**0.8 — `?date=` acepta fechas que no existen.** El `DATE_PARAM_RE` de la página
de agenda deja pasar `2026-02-30`; `localWallClockToUtc` lo rueda a marzo 2 y la
agenda muestra un día distinto al que dice la URL. `dateParamSchema` ya valida
justo eso y no se está usando ahí. De paso, la página define su propio
`parseDateParts` idéntico al `parseDateParam` de `schemas.ts`.

**0.9 — El horizonte se valida contra el reloj dentro de un schema de Zod.**
`dateParamSchema` llama a `Date.now()`, que es exactamente la impureza que
`availability.ts` evitó a propósito inyectando `now`. Y compara medianoche UTC
contra "ahora + 90 días" sin pasar por la zona del negocio, así que en el borde
acepta o rechaza por un día. Sácalo del schema o inyéctale el instante.

**0.10 — `PreorderModal` sigue siendo maqueta.** Su `onSubmit` hace
`preventDefault()` y sus horarios salen del `TIME_SLOTS` hardcodeado que el
formulario de reservación ya dejó de usar. No lo conectes en este módulo —no es
alcance— pero sí decide y dime si esa sección del landing se va a construir o se
va a quitar. Una maqueta que ya no engaña a nadie más que al que la mantiene.

---

## Fase 1 — Diseño (para y espera aprobación)

Dos pantallas, las dos de administración pura (`BUSINESS_ADMIN`), las dos con la
densidad compacta del panel, no la del landing.

**Mesas y QR.** La lista de mesas por zona, con código, asientos y estado.
Y lo que de verdad importa: **la hoja imprimible de códigos QR**, que es el
entregable físico del módulo — alguien la imprime, la recorta y la pega en las
mesas. Diseña esa hoja como pieza de papel, no como pantalla: qué va junto al
código para que un comensal entienda qué escanear, cómo se ve una hoja de doce
mesas, y qué pasa al imprimir sólo una.

**Configuración del negocio.** Horario semanal (con los dos bloques por día que
el esquema permite —comida y cena— y el cierre después de medianoche), cierres
por fecha, y los ajustes de operación. Un horario semanal es una de esas
pantallas que se ven fáciles y se vuelven un desastre: enséñame cómo se edita un
día sin abrir un modal por cada bloque.

Propón, enséñame y **para aquí**.

---

## Fase 2 — Mesas y QR

CRUD de mesas: crear, editar código/zona/asientos, ordenar, desactivar. `code`
es único por negocio (`@@unique([businessId, code])`) — la colisión se explica,
no revienta. Crear en lote es el caso normal, no el raro: nadie da de alta doce
mesas de una en una.

**Rotar el QR** de una mesa es su propia acción, y es destructiva de una forma
que no se ve: invalida el papel pegado en la mesa y deja huérfano cualquier
carrito abierto que llegó por el token viejo. `qrRotatedAt` existe para dejar
constancia. Antes de escribirlo, dime qué crees que debe pasar con esos
carritos — si se migran al token nuevo, si se vacían, o si el caso es tan raro
que se ignora a propósito.

**Borrar una mesa con reservaciones futuras** es la otra decisión: `Reservation`
tiene `onDelete: SetNull` sobre `tableId`, así que borrar deja reservaciones sin
mesa — y una reservación con `tableId` nulo no reserva nada, porque la `EXCLUDE`
constraint no la ve. Soft-delete (`deletedAt`) y bloquear el borrado mientras
haya reservaciones activas es lo que espero; convéncete tú y decídelo.

Y aquí sí, por fin: **`RestaurantTable.status`.** Es el campo que lleva tres
módulos sin dueño y esta es la pantalla que lo mostraría. Ya me diste tu
razonamiento en el módulo pasado; ahora decídelo y aplícalo, o quítalo del
esquema si la conclusión es que nadie lo va a mantener. Un campo que la UI pinta
y nadie escribe es peor que no tenerlo.

---

## Fase 3 — Configuración del negocio

`OpeningHour` y `BusinessClosure` con pantalla propia: sin esto, reservaciones no
puede funcionar en un negocio que no salió del seed. Validar que
`closesAt > opensAt`, permitir el cierre después de medianoche (`closesAt > 1440`,
que `availability.ts` ya sabe leer) y no dejar bloques encimados el mismo día.

Los ajustes de operación que ya lee el código y hoy nadie puede tocar:
`acceptsOnlinePayment`, `defaultReservationMinutes`, `maxPartySize`, `timezone`,
`currency`, `defaultLocale`. Cambiar `timezone` mueve el significado de cada
reservación futura — adviértelo en la pantalla, no en un comentario.

**Y la pregunta que dejé pendiente:** `MIN_BOOKING_LEAD_MINUTES` y
`MIN_CANCEL_LEAD_MINUTES` son constantes en `lib/reservations/dto.ts` con un
comentario que dice, correctamente, que son decisión de negocio. Este es el
módulo donde tendrían que dejar de ser constantes y volverse columnas de
`Business`. **Es cambio de esquema: para y pregúntame** antes de escribir la
migración, con tu propuesta de nombres y defaults.

---

## Fase 4 — Cierre

1. `graphify` y luego
   `node scripts/graphify-to-obsidian.mjs --out "<vault>/04-Proyectos-Verticales/Marea-Codigo"`.
2. Revisa el grado de `getCurrentBusiness()`: este módulo le agrega escrituras,
   no sólo lecturas, y es el símbolo más conectado del repo. Si algo de
   configuración terminó leyéndose por un camino paralelo, ahí se ve.
3. "Conexiones que cruzan módulos": cualquier arista nueva que no esperabas es
   una dependencia que se te coló.
4. Abre el PR. Descripción concisa: qué queda encendible y qué no. Sin menciones
   de herramientas.

---

## Reglas técnicas

Las de siempre: Server Components por defecto · mutaciones con Server Actions
validadas con Zod · `Prisma.Decimal` nunca cruza a un Client Component ·
`deletedAt: null` en todo query de catálogo · `businessId` siempre desde
`getCurrentBusiness()` · `requireRole()` en la primera línea de cada mutación ·
todo lo que toque estado va en transacción · el servidor no confía en el cliente
para disponibilidad ni permisos · sin librerías de UI nuevas · accesible con
teclado y AA · build y lint limpios, sin `any` ni `@ts-ignore`.

Dos del módulo:

- **Ningún token público de capacidad usa `cuid()`.** Ver 0.1. Es la regla que
  este módulo deja escrita, no sólo aplicada.
- **Ninguna fecha ni hora se interpreta en el cliente.** Sigue vigente y este
  módulo la pone a prueba: un horario semanal son minutos desde medianoche
  local, no `Date`s.

---

## Definición de terminado

- [ ] La rama salió de un `main` con `feature/reservations` ya fusionada.
- [ ] `qrToken` usa `cuid(2)` y la regla quedó escrita donde se ve.
- [ ] `npm test` pasa en Windows y me pegaste la salida.
- [ ] 200 intentos de reservar desde una IP se topan con el límite, y un login
      en otra pestaña no lo reinicia.
- [ ] Tres intentos fallidos por horario ocupado no dejan sin reservar a un
      cliente legítimo.
- [ ] Una reservación `PENDING` cuya hora ya pasó tiene una acción que un
      `STAFF` puede ejecutar.
- [ ] Borro un `OpeningHour` y las reservaciones de ese día siguen visibles en
      la agenda.
- [ ] Doy de alta doce mesas, imprimo la hoja de QR y cada código abre el menú
      de su mesa.
- [ ] Roto el QR de una mesa y el token viejo deja de servir.
- [ ] Configuro el horario de un negocio recién creado y puedo reservar sin
      tocar el seed.
- [ ] Un `STAFF` no ve ninguna de las dos pantallas nuevas.
- [ ] Ningún commit pasa de ~400 líneas, ningún cuerpo pasa de 3 líneas, y
      ninguno menciona con qué se escribió.

---

## Lo que NO debes hacer

- Promociones, testimonios, reportes, dashboard de métricas, worker de
  notificaciones (sigue siendo sólo encolar).
- Conectar `PreorderModal`. Ver 0.10: decide y dime, no lo construyas.
- Multi-negocio real. `SUPER_ADMIN` sigue siendo una bandera que salta el filtro
  por `businessId`, sin pantalla propia.
- Cambiar el esquema más allá del `cuid(2)` de 0.1 y de lo que quede autorizado
  tras la pregunta de la Fase 3. El soft-delete de mesas ya existe.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase y
`/security-review` en la Fase 0 y en la Fase 2 — son las que tocan el límite de
tasa y el token que deja pedir a nombre de una mesa. **Para al final de la Fase
1** y espera el visto bueno del diseño; después avanza de corrido, subiendo la
rama y reportando al cerrar cada fase.
