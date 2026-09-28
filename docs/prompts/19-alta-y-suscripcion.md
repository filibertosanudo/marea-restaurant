# Prompt para Claude Code — Módulo 19: alta autoservicio y suscripción

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **Para al final de la Fase 1** con las respuestas de
> alcance. Este módulo tiene más decisiones de producto que ninguno anterior, y
> varias son del dueño, no tuyas.

---

El módulo 18 dejó el sistema en condiciones de guardar datos ajenos: respaldo
cifrado cada seis horas, restauración probada cada mes en una máquina que no es
la de producción, purgas de privacidad programadas, `/api/status` para el
monitor, modo de sólo lectura y un manual que se escribió siguiendo una
restauración real.

Con eso, lo que queda entre este sistema y un negocio es el criterio que la fase
8 del plan escribió desde el principio: **un restaurante nuevo se da de alta y
toma su primer pedido sin que el dueño de la plataforma toque nada.** Hoy no es
así en ningún punto:

- **No hay registro público.** Un restaurante existe porque alguien corrió
  `npm run tenants` con la conexión del dueño de la base, y su primer
  administrador recibe una contraseña temporal impresa en una terminal.
- **La aplicación no puede crear un negocio.** No es un olvido: la cabecera de
  `lib/tenants/provision.ts` lo explica. RLS impide que `marea_app` inserte en
  `Business`, y por eso el aprovisionamiento corre como dueño. Un formulario
  público de registro corre en el proceso web como `marea_app`. **Esa es la
  pregunta de arquitectura de este módulo**, y la respuesta equivocada es darle
  al proceso web la conexión del dueño.
- **No existe verificación de correo.** `emailVerified` está en el esquema desde
  el `init` y no lo lee nadie. Hasta hoy no hacía falta: todos los usuarios los
  creaba un administrador.
- **No se cobra nada.** La plataforma no tiene suscripciones, planes, periodo de
  prueba ni límites. El módulo 18 dejó la costura para el degradado:
  `assertWritable(organizationId)` en `lib/ops/read-only.ts`, con el parámetro
  todavía sin usar.

Este módulo cubre 8.1 (alta sin intervención) y 8.3 (cobrar tu propia
suscripción) del plan. La factura electrónica es el módulo 20.

Lee antes de empezar: `lib/tenants/provision.ts` y `scripts/tenants.ts`
completos, `lib/business-host.ts`, `lib/ops/read-only.ts`,
`lib/auth/permissions.ts`, `lib/stripe/` completo (incluida la regla de ESLint
que impide importar el cliente sin cuenta), `lib/payments/stripe-webhook.ts`,
las migraciones de RLS y de organización, `docs/CONVENCIONES.md`, `AGENTS.md` y
`docs/PLAN-PRODUCCION.md` §8.1 y §8.3.

---

## Cómo trabajar

Como siempre: **todo en inglés** salvo los documentos de planeación, **un pull
request por fase** con ramas encadenadas, autoría exclusivamente tuya, cero
emojis, y `git diff --stat main..HEAD` antes de abrir cada pull request.

```bash
gh pr list --state open
git switch main && git pull
git switch -c feature/onboarding-fase-0 main
```

Este prompt y un cambio en la tabla de estado de `docs/PLAN-PRODUCCION.md`
están sin versionar. Entran en el primer commit de la Fase 0:
`docs(prompts): add module 19`.

**El criterio de este módulo:** un registro público es la primera puerta de
este sistema que cualquiera en internet puede abrir sin que nadie lo haya
invitado. Todo lo que hasta hoy protegía una conexión de dueño o una contraseña
temporal entregada en mano, aquí lo tiene que proteger el diseño. Y el segundo
criterio, que el plan ya dejó escrito: **cortarle el servicio en hora de comida
a un restaurante que se retrasó tres días con la tarjeta es como se pierde un
cliente para siempre.**

---

## Fase 0 — Verificar el terreno (sin escribir código, salvo el commit del prompt)

**1. Cómo se crea hoy un negocio, exactamente.** Lista cada fila que escriben
`createOrganization`, `createBusiness`, `createBusinessAdmin` y
`createOrgAdmin`, en qué tablas, y cuáles de esas escrituras rechaza RLS para
`marea_app`. Compruébalo contra la base, no leyendo las políticas: intenta cada
inserción como `marea_app` en un Postgres desechable y reporta qué pasa. Esa
lista es el tamaño exacto de lo que el registro público necesita que alguien con
más permisos haga por él.

**2. `scripts/tenants.ts` tiene el mismo patrón que te mordió en el módulo 18.**
Lee `process.env.DIRECT_URL ?? process.env.DATABASE_URL`. Es la herramienta que
escribe como dueño, y decide contra qué base lo hace por una variable que
`dotenv` carga del `.env` de desarrollo. Confírmalo y di cómo lo alinearías con
la regla que fijamos para los scripts de respaldo: una variable propia y
explícita, sin inferencias.

**3. Dónde vive el registro.** `slugFromHost` resuelve un negocio por
subdominio de `BUSINESS_ROOT_DOMAIN`, y el dominio raíz desnudo sólo tiene
negocio si hay exactamente uno. Con varios, ¿qué sirve hoy la raíz? Di también
dónde vive el panel cuando hay varios negocios (el módulo 17 lo resuelve por
sesión) y qué pasa con la cookie de sesión de Auth.js entre la raíz y un
subdominio. Un registro en la raíz que termina mandando al usuario a otro host
donde tiene que volver a iniciar sesión es un abandono garantizado.

**4. Qué existe para el asistente.** El plan dice "mesas (con la alta en lote
que ya existe)". Confirma qué hay en `lib/tables/actions.ts`, qué hay para
horarios y para el menú, y qué de todo eso se puede reutilizar desde un
asistente sin duplicar validación.

**5. Qué soporta el SDK para la suscripción.** `stripe@22.5.0` trae
`customer_account` en suscripciones, sesiones de Checkout y sesiones del portal
de facturación, y la configuración `customer` en las cuentas v2. Verifícalo, y
verifica si un `Account` v2 **sólo con configuración de cliente**, sin
configuración de comerciante, es un caso soportado en la versión de API
`2026-07-29.dahlia`. Lo necesitas por la pregunta 4 de la Fase 1.

**6. La costura del módulo 18 está a medio coser.** `requireRole` llama
`assertWritable()` **sin** `organizationId`. Para que el sólo lectura por
organización funcione, alguien tiene que saber la organización del negocio en
cada petición. Di dónde está ese dato hoy (la sesión, el negocio resuelto, una
consulta más) y cuánto cuesta leerlo.

---

## Fase 1 — Decisiones de alcance (para y espera respuesta)

Ocho preguntas. Trae tu recomendación razonada para cada una y **para**. Las
marcadas como del dueño llévalas con opciones y números; no las decidas tú.

### 1. Cómo crea un negocio quien no puede crear negocios

El proceso web corre como `marea_app` y RLS le impide crear el negocio. Hay
salidas que conservan la separación de roles del módulo 17 y una que la
destruye:

- Funciones `SECURITY DEFINER` con `search_path` fijo que hagan exactamente el
  alta y nada más, en el mismo estilo que `marea_business_id_by_slug`.
- Una solicitud de alta que el proceso web escribe y que una tarea con más
  permisos materializa, como la cola de notificaciones.
- Darle al proceso web la conexión del dueño. **Esta no.**

Trae tu propuesta con el contrato exacto: qué recibe, qué valida dentro de la
base (no sólo en TypeScript), qué devuelve, y por qué no puede usarse para
crear un negocio dentro de la organización de otro. Si eliges funciones, di
cómo se prueban como `marea_app` y cómo se revierten.

### 2. Registro, verificación y abuso

Un formulario que crea filas y manda correos es exactamente lo que un bot busca.
Propón:

- **Verificación de correo antes de que el negocio exista para el público.** Hasta
  verificar, ¿qué puede hacer la cuenta? Mi inclinación: puede entrar al
  asistente y configurar, pero la página pública no se publica y no puede
  conectar Stripe.
- **Límite de tasa** con la convención de alcances que ya existe (`signup:create`,
  no `signup-create`).
- **Una trampa para bots** que no dependa de un proveedor externo. El plan no se
  ancló a ninguno y no va a empezar por aquí.
- **Qué pasa con un registro que nunca se verifica.** Un slug reservado para
  siempre por alguien que nunca volvió es un slug que el restaurante real ya no
  puede usar.
- **Qué pasa con alguien que se registra con el correo de otro.** El correo de
  verificación no debe revelar si esa dirección ya tiene cuenta.

### 3. El asistente, los datos de ejemplo y la importación por CSV

El plan pide un asistente de cuatro pasos (datos del negocio, horario, mesas,
primeros platillos), datos de ejemplo desechables con un botón de "borrar datos
de ejemplo", e importación de menú por CSV con vista previa y validación fila por
fila.

Decide:

- **Cómo se marcan los datos de ejemplo** para que el botón de borrar no toque
  nunca un dato real. ¿Qué pasa si el dueño edita un platillo de ejemplo y lo
  convierte en suyo? Un botón que borra el platillo que el restaurante ya estaba
  vendiendo es peor que no tener datos de ejemplo.
- **Qué acepta el CSV.** Un archivo guardado desde Excel en Windows en español
  llega con otra codificación, a veces con marca de orden de bytes, y con
  precios escritos como `$1,250.00`. Si el importador sólo funciona con el CSV
  que tú generaste en las pruebas, no funciona. Di qué columnas, qué formatos y
  qué se hace con una fila mala: ¿se importa el resto o nada?
- **Imágenes: fuera del CSV.** Un importador que descarga la URL de una imagen que
  escribió el usuario es una vía para que el servidor haga peticiones a donde el
  usuario quiera. Las fotos se suben después con la pantalla que ya existe.
- **Modificadores:** ¿entran en la primera versión o no?

### 4. Qué objeto de Stripe paga la suscripción (tuya y mía)

En el módulo 17b te pedí evaluar Accounts v2 con un argumento: el mismo `Account`
podría ser comerciante y cliente, y la suscripción colgaría de él. Ese
argumento tiene dos huecos que el diseño del 17b no tenía por qué resolver:

- **La cuenta conectada es por negocio; la suscripción es por organización.**
  Una cadena con tres sucursales tiene tres cuentas conectadas y una sola
  suscripción. ¿De cuál cuelga?
- **Un restaurante que sólo cobra en efectivo no tiene cuenta conectada** y
  tiene que pagar igual.

Así que el pagador de la suscripción tiene que ser independiente de las cuentas
de comerciante. Propón cuál: un `Account` v2 sólo con configuración de cliente
por organización (si la Fase 0 punto 5 confirmó que es soportado), o un
`Customer` v1. Recuerda que la suscripción vive en **la cuenta de la
plataforma**, no en una conectada, así que el cliente de Stripe que la toca es
el de la plataforma: dile a `stripeFor(null)`, o a lo que corresponda, por qué
eso es correcto aquí y no un olvido.

De paso, esto obliga a otra decisión: **¿toda alta crea una organización?** Hoy
`Business.organizationId` es opcional. Si la suscripción es por organización, un
restaurante de una sola sucursal necesita una. Mi inclinación: sí, siempre, y la
organización de un solo negocio no se le muestra al usuario como tal.

### 5. Cómo se paga y quién ve la tarjeta

Checkout alojado por Stripe y el portal de facturación, o formularios propios con
Elements. Mi inclinación: alojado. Cambiar tarjeta, ver facturas y cancelar son
tres pantallas que no hay que construir ni mantener, y ningún dato de tarjeta
toca este sistema.

Decide también el periodo de prueba: **¿con o sin tarjeta al registrarse?** Sin
tarjeta convierte más registros y cobra menos. Y decide qué pasa al terminar la
prueba sin método de pago: la suscripción de Stripe tiene un comportamiento
configurable para ese caso, y el que elijas define qué ve el restaurante el día
siguiente. La fecha de fin de la prueba se ve en el panel desde el primer día,
como pide el plan.

### 6. Planes, precios e impuestos — del dueño

Los planes, sus precios y sus límites los decide el dueño, no tú y no yo. Tu
trabajo es que el código no dependa de ellos:

- Los precios viven en Stripe y el código los encuentra por `lookup_key`, no por
  ids escritos en el código ni en variables de entorno.
- Los límites de cada plan (sucursales, usuarios, pedidos al mes) viven en un
  solo lugar legible, y cambiar un número no requiere tocar lógica.

Trae la propuesta de dónde viven esos límites y tres preguntas concretas para el
dueño: cuántos planes, qué límite separa uno de otro, y si el precio incluye IVA.
**Sobre el IVA no decidas nada:** si se cobra con Stripe Tax, con precios que ya
lo incluyen o de otra forma es una conversación con su contador, y la factura
fiscal de la suscripción que el restaurante le va a pedir es cosa del módulo 20.

### 7. Qué pasa cuando se llega a un límite

Hay límites que se pueden aplicar al crear algo y límites que no.

- **Sucursales y usuarios:** la acción que crea una más dice por qué no puede y
  cómo cambiar de plan. Sin sorpresa.
- **Pedidos al mes: nunca bloquean a un comensal.** Un restaurante que tuvo un buen
  mes no se queda sin poder vender en su mejor día por haber vendido demasiado.
  Propón qué pasa en su lugar: aviso, cobro por excedente, cambio de plan
  sugerido. Pero el pedido entra.

### 8. El degradado: qué deja de funcionar primero — del dueño

El plan escribió "modo sólo lectura durante 15 días antes de suspender". Aplicado
tal cual, sólo lectura en un restaurante significa que no puede tomar pedidos:
es una suspensión con otro nombre, a partir del primer día.

Propón una escalera y tráela al dueño con tu recomendación. La mía, para que la
compares: **lo primero que deja de funcionar es lo que usa el dueño, no lo que
usan sus comensales.**

1. Pago fallido: Stripe reintenta, el panel muestra un aviso cada vez más
   visible, y todo funciona.
2. Pasado un plazo: la configuración del panel queda en sólo lectura (menú,
   precios, usuarios, ajustes), pero pedidos, cocina, caja y reservaciones
   siguen funcionando.
3. Pasado otro plazo: suspensión, con una página pública digna, no un error.

Sea cual sea la escalera, tres reglas que no se negocian:

- **Pagar tiene que funcionar siempre.** Las acciones que abren Checkout o el
  portal de facturación quedan fuera de cualquier sólo lectura por
  organización, o el restaurante queda atrapado sin forma de salir.
- **El sólo lectura por organización no toca los webhooks de Stripe.** El del
  módulo 18 responde 503 porque es de toda la plataforma y es temporal. Uno por
  organización que rechace webhooks rechazaría el `invoice.paid` que la saca del
  degradado.
- **Nada cambia de estado en hora de servicio por una fecha que venció a medianoche.**
  Una transición que se programa para después del cierre del restaurante, en su
  zona horaria, cuesta poco y evita la llamada que el plan describe.

**Para aquí.**

---

## Fase 2 — El alta como primitiva

Lo decidido en la pregunta 1, más lo que haga falta de la 4 (la organización
siempre).

- La migración con el mecanismo elegido, escrita a mano, con su "Revert with" en
  la cabecera como las anteriores.
- Pruebas como `marea_app`: que el alta funciona, que no puede crear un negocio
  en una organización ajena, que un slug reservado o repetido falla con un
  error legible, y que nada de esto le da a `marea_app` un permiso que no tenía
  para cualquier otra cosa.
- `scripts/tenants.ts` alineado con lo que la Fase 0 punto 2 haya concluido.
  Idealmente usa la misma primitiva, para que haya un solo camino de alta y no
  dos que se separen con el tiempo.

---

## Fase 3 — Registro y verificación

Lo decidido en la pregunta 2. El formulario, el correo de verificación con las
plantillas bilingües que ya existen, la verificación, y la limpieza de registros
sin verificar con el mecanismo de tareas programadas del módulo 18 (una entrada
más en el mismo `crond`, con su registro de ejecución).

El registro no revela si un correo ya existe, ni en el mensaje ni en el tiempo
de respuesta.

---

## Fase 4 — El asistente

Los cuatro pasos, reutilizando las acciones y los esquemas de validación que ya
existen en vez de duplicarlos. Cada paso guarda al avanzar: quien cierra el
navegador en el paso tres vuelve al paso tres, no al uno.

---

## Fase 5 — Datos de ejemplo e importación por CSV

Lo decidido en la pregunta 3. La prueba de la importación incluye archivos
guardados desde Excel con la codificación y el formato reales, en el repositorio
como fixtures. La vista previa muestra cada fila con su error antes de escribir
nada.

---

## Fase 6 — La suscripción

Lo decidido en las preguntas 4, 5 y 6:

- El modelo de suscripción por organización, que refleja el estado de Stripe.
  **Stripe es la fuente de verdad del estado**; la fila local es un espejo que
  se actualiza por webhook, igual que `Payment` sólo pasa a `SUCCEEDED` por el
  webhook. Ninguna pantalla decide que una suscripción está pagada porque el
  usuario volvió de Checkout.
- El periodo de prueba al registrarse, visible en el panel.
- Checkout y el portal de facturación.
- Los eventos de facturación en el endpoint de plataforma, con la idempotencia
  por `eventId` que ya existe. Di qué eventos atiendes y por qué esos.

Pruebas con eventos firmados, y la llamada de humo en sandbox antes de todo lo
demás, como en el 17b.

---

## Fase 7 — Límites

Lo decidido en la pregunta 7. Los límites de creación se comprueban en el
servidor, no ocultando el botón. El de pedidos no bloquea nunca un pedido, y hay
una prueba que lo demuestra.

---

## Fase 8 — El degradado

Lo decidido en la pregunta 8, conectado a la costura del módulo 18. La prueba
que recorre las Server Actions en busca del guardia se extiende para cubrir el
alcance por organización y **las excepciones de pago**, que también tienen que
estar comprobadas por la prueba, no sólo por un comentario.

Pruebas: cada escalón de la escalera, que pagar funciona en todos ellos, que un
`invoice.paid` saca a la organización del degradado, y que una transición no
ocurre durante el horario del restaurante.

---

## Fase 9 — Cierre

- `docs/PLAN-PRODUCCION.md`: la fila del módulo 19, las casillas que cumple del
  criterio de terminado de la fase 8, y el Apéndice F.
- `docs/RUNBOOK.md`: qué hacer con un registro sospechoso, cómo extender una
  prueba o aplicar un descuento desde Stripe, y cómo sacar a mano a una
  organización del degradado si el webhook no llegó.
- `docs/DEPLOY.md`: los precios que hay que crear en Stripe con sus `lookup_key`,
  los eventos nuevos que hay que suscribir en el endpoint de plataforma, y la
  configuración del portal de facturación.
- Obsidian, en `04-Proyectos-Verticales/Marea-Bitacora/`, siguiendo
  `09-Plantillas/Plantilla-Nota-de-Bitacora`: qué ve un restaurante nuevo desde
  que llega hasta su primer pedido, y qué tiene que hacer el dueño a mano.
- El pull request final a `main`, con `git diff --stat main..HEAD` antes.

---

## Reglas técnicas

- **El proceso web nunca tiene la conexión del dueño.** Ni para el alta, ni
  "sólo para esto".
- **Stripe es la fuente de verdad del estado de la suscripción.** El webhook lo
  aplica; ninguna redirección lo decide.
- **Las llamadas de facturación van a la cuenta de la plataforma.** Pasan por
  `lib/stripe/`, como todo lo demás, y la regla de ESLint del 17b no se relaja:
  si hace falta un cliente para facturación, se agrega ahí con el mismo cuidado
  que `stripeFor`.
- **Ni precios ni ids de precio en el código.** `lookup_key`.
- **Los límites no se aplican ocultando botones.**
- **Ningún pedido de un comensal falla por el estado de la suscripción del
  restaurante** en ningún escalón anterior a la suspensión.
- **`stripe@22.5.0`, versión de API `2026-07-29.dahlia`.** No se suben en este
  módulo.

Y las de siempre: TypeScript estricto sin `any`, comentarios cortos que expliquen
**por qué** y no qué, pull requests por debajo de las 400 líneas cuando se pueda,
y ningún secreto en el repositorio.

---

## Definición de terminado

- **Un restaurante nuevo se registra, verifica su correo, pasa el asistente,
  importa su menú, conecta Stripe y toma su primer pedido sin que el dueño de la
  plataforma toque nada.** Hay una prueba de extremo a extremo que lo recorre,
  con Stripe simulado donde haga falta.
- El proceso web sigue sin la conexión del dueño, y hay una prueba que intenta el
  alta como `marea_app` fuera del camino permitido y falla.
- Un registro sin verificar no publica nada y caduca solo.
- El CSV de Excel en español se importa, y una fila mala se ve antes de escribir.
- Los datos de ejemplo se borran sin tocar nada que el restaurante haya hecho
  suyo.
- La suscripción, la prueba, Checkout y el portal funcionan contra sandbox, y su
  estado sólo lo cambia el webhook.
- Llegar a un límite de pedidos no bloquea ningún pedido.
- La escalera del degradado se cumple como la aprobó el dueño, pagar funciona en
  cada escalón, y ningún cambio ocurre en horario de servicio.
- La suite completa pasa: `npm run lint`, `tsc --noEmit`, unitarias,
  integración y e2e.

---

## Lo que NO debes hacer

- **No le des al proceso web la conexión del dueño**, ni por una variable de
  entorno "sólo para el registro".
- **No decidas precios, planes, límites ni el tratamiento del IVA.** Trae
  opciones; decide el dueño.
- **No descargues imágenes desde URLs de un CSV.**
- **No bloquees pedidos de comensales por límites ni por el degradado** antes de
  la suspensión.
- **No rechaces webhooks por el sólo lectura de una organización.**
- **No marques una suscripción como pagada desde una redirección de Checkout.**
- **No uses un proveedor externo de captcha.**
- **No sigas si hay un pull request abierto**, y no encadenes una rama sin haber
  comprobado antes qué trae de más con `git diff --stat main..HEAD`.
- **Cero emojis**, en el código, en los commits, en los pull requests y en
  Obsidian.

---

## Cómo trabajar

Fase 0 y para en la Fase 1. No empieces la Fase 2 sin las ocho respuestas: dos
son del dueño (planes y precios, y la escalera del degradado), y la primera
decide si el registro público se puede construir sin romper la separación de
roles que el módulo 17 tardó siete pull requests en levantar.
