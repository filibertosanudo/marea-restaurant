# Prompt para Claude Code — Módulo 11: notificaciones reales

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **Para al final de la Fase 1** a esperar respuesta
> sobre las plantillas.

---

Cuatro módulos seguidos de infraestructura: despliegue portátil, documentación,
pruebas, seguridad. Este es el primero en mucho tiempo que un cliente notaría.

Hoy el sistema encola notificaciones perfectamente y **no envía ninguna**.
`NotificationJob` se crea dentro de la misma transacción que el cambio que la
provoca —patrón outbox, bien hecho desde el primer día— en reservaciones, en el
checkout, en cada avance de estado del pedido y ahora también en la recuperación
de contraseña del módulo 10. Las filas se quedan en `QUEUED` para siempre porque
**no existe ningún consumidor**: ni worker, ni proveedor de correo, ni una sola
dependencia de envío en `package.json`.

Las consecuencias, en orden de gravedad:

- Un cliente reserva mesa, recibe un código de confirmación en pantalla, y
  **nunca recibe nada más**. Si cierra la pestaña, perdió el código y con él la
  única forma de consultar o cancelar su reservación.
- La recuperación de contraseña que el módulo 10 construyó entera funciona hasta
  el punto exacto en que habría que mandar el correo. Hoy sólo sirve porque el
  enlace se escribe en consola.
- "Tu pedido está listo" no llega. En un pedido para llevar eso es la
  funcionalidad completa, no un extra.

Es el bloqueador número uno para vender el sistema. Un restaurante que no puede
avisar "tu mesa está confirmada" no compra, por bien construido que esté todo lo
demás.

**Lo que este módulo tiene a favor:** el esquema ya documenta el algoritmo del
worker en el comentario de `NotificationJob`, incluido el `FOR UPDATE SKIP
LOCKED`, el lease con `lockedAt`/`lockedBy`, el backoff sobre `attempts` y la
idempotencia por `dedupeKey`. No hay que diseñarlo: hay que implementarlo tal
como está escrito.

Lee antes de empezar: el modelo `NotificationJob` en `prisma/schema.prisma` —
**entero, con sus comentarios**—, `docs/CONVENCIONES.md`, `AGENTS.md` y
`docs/PLAN-PRODUCCION.md` fase 3.

---

## Cómo trabajar

Como en los dos módulos anteriores: **todo en inglés** salvo los documentos de
planeación, **un pull request por fase** con ramas encadenadas, autoría
exclusivamente tuya, cero emojis.

```bash
gh pr list --state open          # vacío antes de empezar el módulo
git switch main && git pull
git switch -c feature/notifications-fase-0 main
```

**Una nota sobre el estado del repositorio.** El módulo 10 dejó siete ramas
(`feature/hardening-fase-1` a `fase-5` y `fase-7`) y dos de arreglo
(`fix/payment-intent-effect-loop`, `fix/reservation-cancel-refresh-race`) que
todavía no están en `main`. **Este módulo no empieza hasta que todas estén
fusionadas.** Si al correr el bloque de arriba `gh pr list` devuelve algo, para y
dime.

---

## Fase 0 — Cerrar el módulo 10

**0.1 — El segundo factor quedó fuera y hay que dejarlo escrito.** La Fase 6 del
módulo 10 se pospuso deliberadamente. Anótalo donde se vaya a leer: una línea en
`docs/PLAN-PRODUCCION.md` diciendo que TOTP sale de la fase 2 y pasa a un módulo
propio, y la casilla correspondiente en la nota de bitácora del módulo 10. Una
decisión que no se escribe se vuelve un olvido.

**0.2 — `Order.locale` no existe, y se nota.** Los correos de cambio de estado
usan `business.defaultLocale` porque el pedido no guarda el idioma con que
navegaba el invitado. `create-order.ts` **sí** conoce ese idioma en el momento
del checkout: lo recibe como parámetro `lang` y lo usa para congelar los nombres
de los platillos. Simplemente no lo persiste.

Añade la columna, guárdala en el checkout, y que el worker la prefiera sobre el
idioma del negocio. Es una migración de una línea y evita que este módulo nazca
mandando correos en el idioma equivocado. Lo mismo aplica a `Reservation`.

**0.3 — Limpieza de ramas fusionadas**, como siempre.

---

## Fase 1 — El contrato de envío (para y espera respuesta)

Mismo principio que el almacenamiento del módulo 7: **interfaz primero,
proveedor después**. Ningún proveedor entra al código sin una interfaz y al
menos dos implementaciones.

```ts
export interface Mailer {
  send(msg: {
    to: string;
    subject: string;
    html: string;
    text: string;
    idempotencyKey?: string;
  }): Promise<{ providerMessageId: string | null }>;
}
```

**Drivers:**

- **`console`** — imprime y no manda nada. Es el que corre en las pruebas y en
  desarrollo sin credenciales, y el que hace que este módulo se pueda probar
  hoy mismo.
- **`smtp`** (nodemailer) — el de producción por defecto. Habla con cualquier
  cosa: un Postfix propio, Zoho, Brevo, Mailgun, el SMTP de SES, o un MailHog
  local. Es un protocolo, no un producto: cero anclaje.
- **`resend`** — opcional, detrás de la misma interfaz.

Añade **MailHog al `docker-compose.yml`** para ver los correos renderizados en
un navegador durante el desarrollo. Es lo que convierte "creo que se ve bien" en
"lo vi".

### La decisión que quiero responder yo

**Cómo se construye el HTML de los correos.** El HTML de correo es un infierno
de tablas anidadas y estilos en línea porque Outlook sigue usando el motor de
renderizado de Word. Dos caminos:

1. **`react-email`** — componentes React que compilan a ese HTML. Una
   dependencia más, pero sustituye bastante más de cien líneas propias de una
   clase de código que nadie quiere escribir ni mantener, que es exactamente el
   criterio de las convenciones.
2. **Plantillas propias** con un layout base y sustitución de variables. Cero
   dependencias, pero te vuelves responsable de que se vea bien en Outlook,
   Gmail y Apple Mail.

Me inclino por la primera. **Propón con tu razón y para aquí.**

Sea cual sea: **cada correo genera HTML y texto plano**. El texto no es
opcional, es la mitad de lo que evita la carpeta de spam.

---

## Fase 2 — Las plantillas

Seis, cada una en español e inglés, resueltas por el `locale` que el job ya
guarda:

| `templateKey` | Se dispara en |
|---|---|
| `reservation.confirmed` | `createReservationAction` |
| `order.confirmed` | `createOrderFromCart` |
| `order.ready` | `advanceOrderStatusAction` |
| `order.delivered` | `advanceOrderStatusAction` |
| `order.cancelled` | `cancelOrderAction` |
| `password.reset` | `requestPasswordResetAction` |

Ojo con `order.ready` y `order.delivered`: se construyen dinámicamente como
`order.${nextStatus.toLowerCase()}`. Si añades una plantilla con un nombre que
no case exactamente, el job se encola y nunca encuentra su plantilla. **Que un
`templateKey` sin plantilla falle ruidosamente**, no en silencio.

Cada plantilla lleva lo que el cliente necesita para actuar, no un folleto:

- **Reservación:** fecha y hora en la zona del negocio, tamaño de la mesa, el
  código de confirmación **grande y copiable**, y el enlace a `/r/<código>`. Ese
  código es toda la autenticación que tiene para consultar o cancelar; si el
  correo lo entierra, el correo falló.
- **Pedido:** folio, resumen de líneas, total, y el enlace a `/o/<publicToken>`.
- **Listo o entregado:** folio y poco más. Se lee en tres segundos, de pie.
- **Cancelado:** el motivo, que ya se guarda en `cancellationReason`.
- **Recuperación:** el enlace, cuánto dura, y qué hacer si no fue el usuario
  quien lo pidió.

Todas: nombre del negocio, un pie con dirección y teléfono reales sacados de
`Business`, y **cero emojis**, como el resto del proyecto.

---

## Fase 3 — El worker

El corazón del módulo. El esquema ya lo especificó:

```sql
SELECT ... FROM "NotificationJob"
WHERE status = 'QUEUED' AND "runAfter" <= now()
ORDER BY "runAfter" LIMIT 20
FOR UPDATE SKIP LOCKED;
```

`SKIP LOCKED` permite correr varios workers sin coordinación externa. El lease
(`lockedAt`, `lockedBy`) permite que otro worker robe un trabajo cuyo dueño
murió a media ejecución. El backoff es exponencial sobre `attempts` hasta
`maxAttempts`.

### El problema que hay que resolver bien, no rodear

**Una cola con reintentos entrega al menos una vez, no exactamente una vez.** Si
el worker manda el correo y muere antes de marcar el job como `SENT`, el lease
vence, otro worker lo toma, y el cliente recibe el mismo correo dos veces.
`dedupeKey` no salva de esto: impide encolar dos veces, no enviar dos veces.

Tres formas de acotarlo, y quiero que elijas y **escribas por qué** en el código:

- Marcar `SENT` **antes** de enviar. Cambia el fallo de "manda dos veces" a "no
  manda ninguna", que para un correo de "tu mesa está confirmada" es peor.
- Marcar `PROCESSING` con el lease, enviar, y marcar `SENT` después. Es lo que
  el esquema sugiere, y la ventana de doble envío queda reducida al hueco entre
  el envío y la escritura.
- Pasar el `dedupeKey` como **clave de idempotencia del proveedor**, cuando lo
  soporte, y dejar que él descarte el duplicado. Es lo único que lo cierra de
  verdad, y por eso la interfaz de la Fase 1 lleva `idempotencyKey`.

Lo que **no** vale es no decidir y que el comportamiento quede implícito.

### Reglas duras

- **Nunca se envía dentro de una transacción de base de datos.** Una llamada de
  red dentro de una transacción mantiene una conexión bloqueada a merced de un
  servidor SMTP que puede tardar treinta segundos.
- **Un rebote permanente no se reintenta cinco veces.** Correo inexistente,
  dominio inválido, buzón cerrado: se marca `FAILED` con su `lastError` a la
  primera. El backoff es para fallos transitorios.
- **Apagado limpio con `SIGTERM`:** termina el lote en curso y suelta los leases
  en vez de dejar veinte jobs bloqueados hasta que venza el plazo.

### Dos modos de ejecución, una sola función

Esta es la decisión de portabilidad del módulo, igual que el driver de
almacenamiento lo fue del 7:

- **Proceso largo** (`scripts/worker.ts`, servicio propio en
  `docker-compose.yml` — el hueco ya está comentado ahí desde el módulo 7). El
  modo recomendado: `poll → procesa → duerme`.
- **Endpoint invocable** (`app/api/cron/notifications/route.ts`, protegido con
  `CRON_SECRET`) para plataformas serverless donde no puedes tener un proceso.

**Ambos llaman a la misma función** `processQueue(limit)`. El modo sólo cambia
quién la llama. Eso es lo que impide que la elección de hosting se filtre a la
lógica.

---

## Fase 4 — Ver la cola

Sin esto el worker falla en silencio y te enteras por un cliente enojado.

- Pantalla en `/admin/configuracion`, sólo `BUSINESS_ADMIN`: los últimos 50
  envíos con estado, destinatario, plantilla e intentos. El dueño quiere poder
  responder "¿le llegó su confirmación?" sin llamarte.
- Reintentar un job fallido a mano, desde ahí.
- Un contador de profundidad de cola: `QUEUED` con `runAfter <= now()`.
- Log estructurado en cada transición, y un log de error cuando un job agota
  `maxAttempts`.

**No construyas alertas externas** (Sentry, correos al administrador). Eso es
parte de la fase de operación y no de este módulo. Deja el dato expuesto; quien
lo monitoree llega después.

---

## Fase 5 — Boletín

`NewsletterSubscriber` existe con `confirmedAt` y `unsubscribedAt` desde el
primer día —o sea, con el doble opt-in ya modelado— y el módulo 10 le añadió el
token de baja. Con el worker disponible, cerrar el circuito es media tarde:

1. El formulario del pie da de alta con `confirmedAt` nulo.
2. Se encola un correo de confirmación con su enlace.
3. El clic sella `confirmedAt`.
4. **Cada envío lleva enlace de baja** con el token, y funciona sin sesión.

Sin baja funcional no se manda nada: es lo que separa un boletín de un problema
legal. Y el aviso de privacidad que el módulo 10 escribió se enlaza desde el
formulario.

---

## Fase 6 — Cierre

1. `graphify` y el generador.
2. Nota de bitácora en `Marea-Bitacora/11-Notificaciones.md`. La tabla de
   decisiones lleva: el motor de plantillas, la estrategia de doble envío, y el
   modo de ejecución del worker.
3. Marca "Notificaciones reales" en la checklist de `Grupo-1-Comida-Bebida.md`.
   Es la primera casilla de "falta para poder venderlo" que se cierra.
4. Verificación de autoría y pull request. **Sin fusionar.**

---

## Reglas técnicas

Las de siempre. Cinco propias del módulo:

- **Ningún envío dentro de una transacción.**
- **El worker no importa nada de `app/`.** Es un proceso aparte que comparte
  `lib/`, no una ruta de Next disfrazada.
- **Las plantillas no consultan la base.** Reciben el `payload` que el job ya
  congeló al encolarse. Si a una plantilla le falta un dato, el arreglo está en
  quien encola, no en la plantilla: un correo tiene que decir lo que era cierto
  cuando pasó el hecho, no cuando se mandó.
- **Nada de secretos ni tokens en los logs.** Ni el enlace de recuperación
  completo, ni el token de baja.
- **Toda plantilla se prueba renderizada**, con `payload` real, en las dos
  lenguas. Una prueba que sólo comprueba que la función no lanza no prueba que
  el correo se lea.

Dependencias autorizadas: `nodemailer` y sus tipos, y `react-email` **si la
Fase 1 sale por ahí**. Cualquier otra, pregunta.

---

## Definición de terminado

- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` limpios, con la salida.
- [ ] CI en verde, cobertura dentro de umbral.
- [ ] Reservar en la landing produce un correo visible en MailHog, en los dos
      idiomas, con el código de confirmación legible.
- [ ] El enlace de `/r/<código>` del correo abre la reservación y permite
      cancelarla.
- [ ] La recuperación de contraseña del módulo 10 funciona **de punta a punta
      por correo**, sin leer la consola.
- [ ] Matar el worker a media ejecución y reiniciarlo: el trabajo se recupera y
      **no se envía dos veces**. Enséñame cómo lo probaste.
- [ ] Un job que agota `maxAttempts` queda en `FAILED` con su `lastError`
      legible, y aparece en la pantalla del panel.
- [ ] Un rebote permanente no consume cinco intentos.
- [ ] `SIGTERM` al worker suelta los leases.
- [ ] Los dos modos de ejecución funcionan y comparten la misma función.
- [ ] Con un proveedor SMTP real, un correo llega a Gmail **sin caer en spam**:
      SPF, DKIM y DMARC configurados. Enséñame la cabecera de autenticación.
- [ ] Un pedido hecho en inglés recibe sus correos en inglés.
- [ ] Alta y baja del boletín funcionan, la baja sin sesión.
- [ ] Un pull request por fase, todos con la plantilla llena, ninguno fusionado.
- [ ] Todo en inglés salvo los documentos de planeación.
- [ ] El grep de autoría devuelve vacío en todas las ramas.

---

## Lo que NO debes hacer

- **No construyas WhatsApp ni SMS.** `NotificationChannel` ya los tiene en el
  enum y son valiosos en México, pero son otro proveedor, otro formato y otras
  reglas de consentimiento. Módulo aparte. Lo único que este módulo debe hacer
  al respecto es **no cerrarles la puerta**: la interfaz de la Fase 1 tiene que
  poder crecer a otro canal sin reescribirse.
- **No construyas el segundo factor.** Sigue pospuesto.
- **No metas Sentry ni alertas externas.** Fase 4 expone el dato y ya.
- **No cambies la máquina de estados de pedidos ni de reservaciones.** Este
  módulo consume los eventos que ya existen; no añade ninguno.
- **No mandes correos al personal** ("tienes un pedido nuevo"). Para eso está el
  tablero en vivo. Un correo por pedido en hora pico es ruido, no una función.
- **No toques reportes, inventario ni promociones.** Módulos 12 en adelante.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase.
`/security-review` en la Fase 3 y en la Fase 5: la primera manda enlaces con
tokens de recuperación, la segunda expone una acción sin sesión.

**Para al final de la Fase 1** con tu propuesta de motor de plantillas y espera
mi respuesta. Puedes ir montando los drivers y MailHog mientras.
