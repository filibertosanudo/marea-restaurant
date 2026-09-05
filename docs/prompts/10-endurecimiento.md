# Prompt para Claude Code — Módulo 10: endurecimiento de seguridad

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **No hay parada de diseño**, pero sí una decisión en
> la Fase 6 que quiero responder yo antes de que se construya.

---

El módulo 9 dejó 61 archivos de prueba, integración continua en verde y umbrales
de cobertura que rompen el CI. Eso cambia lo que se puede hacer en este módulo:
por primera vez se puede tocar la autenticación sin cruzar los dedos.

Y hace falta, porque lo que queda es la lista de la auditoría que nadie ha
tocado. Tres hallazgos altos y cuatro medios, todos vigentes hoy:

- **Cambiar la contraseña no pide la contraseña actual.** Cualquiera con acceso
  momentáneo a una sesión abierta —la tablet de la cocina, que según tu propio
  documento de producto "se loguea una vez y se queda meses"— se apodera de la
  cuenta. Y cambiarla no revoca los tokens de los demás dispositivos: siguen
  vivos hasta ocho horas.
- **`next.config.mjs` no define una sola cabecera de seguridad.** El panel se
  puede cargar dentro de un iframe, lo que convierte "Cancelar pedido" y
  "Reembolsar" en objetivos de clickjacking.
- **Las cookies de carrito, mesa e idioma no llevan `secure`.** En un despliegue
  propio, que es a donde va este producto, el token de carrito viaja en claro por
  el WiFi del propio local.
- **El circuito público del pedido no tiene límite de tasa.** Las reservaciones
  sí. `addToCartAction`, `createOrderAction` y `createPaymentIntentAction` no. Un
  script llena el tablero de cocina de pedidos falsos en minutos. No es robo de
  datos: es que la cocina deja de poder trabajar.
- **Un `BUSINESS_ADMIN` puede desactivar a cualquier otro** y no queda rastro de
  quién lo hizo. Contrasta con el cuidado que sí se puso en
  `OrderStatusEvent.changedById` y `Refund.createdById`: la trazabilidad se
  aplicó al dinero pero no al acceso.
- **No hay recuperación de contraseña.** Si el dueño olvida la suya, la única
  salida es editar la base a mano.
- **La política de contraseñas es `min(8)` y nada más.** El generador de
  temporales sí es correcto; el problema es el formulario de cambio, donde el
  empleado la cambia a algo de ocho dígitos en el primer login forzado.

Este módulo cierra los siete.

**Una advertencia antes de empezar, y va en serio:** este es el único módulo del
plan que puede dejarte fuera de tu propio panel. Vas a tocar el callback `jwt`,
la revocación de sesiones y la política de contraseñas. Antes de la Fase 2, ten a
mano cómo volver a entrar —`npm run db:seed` contra la base local, o un
`UPDATE` directo del `passwordHash`— y pruébalo **antes** de necesitarlo.

Lee antes de empezar: `docs/CONVENCIONES.md`, `AGENTS.md`,
`docs/product/roles-y-alcance.md` y `docs/PLAN-PRODUCCION.md` fase 2, de donde
sale este prompt.

---

## Cómo trabajar

Como en el módulo 9: `docs/CONVENCIONES.md` manda, **todo en inglés** salvo los
documentos de planeación, **un pull request por fase** con ramas encadenadas, y
autoría exclusivamente tuya sin trailers ni menciones de herramientas.

```bash
gh pr list --state open          # vacío antes de empezar el módulo
git switch main && git pull

git switch -c feature/hardening-fase-0 main
git switch -c feature/hardening-fase-1 feature/hardening-fase-0
# y así
```

**Cinco de las ocho fases tocan el esquema.** Cada migración va sola, en su
propio commit, con nada más. Y cada una tiene que ser reversible: escribe el
`DOWN` mentalmente antes de escribir el `UP`, y si no lo es, dilo en la
descripción del pull request.

`/security-review` al cerrar **todas** las fases de este módulo, no sólo algunas.

---

## Fase 0 — Tres pendientes del módulo anterior

**0.1 — `test:integration` corre con `--passWithNoTests`.** Cuando se añadió no
había pruebas de integración; ahora hay treinta y tantas. Esa bandera hoy sólo
sirve para que una configuración rota del proyecto `integration` pase en verde
sin correr nada. Quítala.

**0.2 — Ramas fusionadas sin borrar.** `git branch --merged main` devuelve
`feature/portable-deploy`, y en cuanto se fusionen las del módulo 9 serán nueve
más. La limpieza ya está en el bloque de apertura de rama de las convenciones;
córrela.

**0.3 — La sección 10 de las convenciones está escrita pero no aplicada.**
Dice qué checks marcar como obligatorios en `main`. Configúralo en la interfaz
de GitHub y **enséñame la captura** en el pull request. Es lo único de este
módulo que no puedes hacer desde el repositorio, y sin ello todo el CI del
módulo 9 es opcional.

---

## Fase 1 — Cabeceras, CSP y cookies

Sin esquema, sin sesión, sin nada que pueda dejarte fuera. Por eso va primera.

**Cabeceras.** `headers()` en `next.config.mjs`, para todas las rutas:
`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` con
cámara, micrófono y geolocalización negadas, y `X-Frame-Options: DENY`.

**La CSP tiene un obstáculo real y hay que resolverlo bien.** El script inline
de tema en `app/layout.tsx` —el que fija `data-theme` antes del pintado para
evitar el parpadeo— obliga a `unsafe-inline`, que anula media política. La salida
es un **nonce por petición**, generado en `proxy.ts` y leído en el layout con
`headers()`.

Dos cosas que se rompen en silencio si te las saltas:

- **`frame-src` tiene que permitir `js.stripe.com` y `hooks.stripe.com`**, o el
  modal de 3D Secure deja de aparecer y los pagos con verificación fallan sin
  error visible. Pruébalo con la tarjeta `4000 0025 0000 3155` que documenta el
  README, de punta a punta, y enséñame que pasa.
- **`connect-src` necesita `api.stripe.com`**, y `img-src` necesita el host del
  storage además de `data:`.

Empieza en `Content-Security-Policy-Report-Only` si quieres verla sin romper
nada, pero **el módulo no se cierra en modo reporte**: termina aplicada.

**Cookies.** `secure: process.env.NODE_ENV === "production"` en las tres
funciones de `lib/cart/cookie.ts` y en `lib/i18n/actions.ts`. Ya llevan
`httpOnly` y `sameSite: "lax"`, que es lo correcto.

---

## Fase 2 — Sesión y contraseñas

El hallazgo alto número uno. Tres cambios que van juntos.

**(a) Exigir la contraseña actual**, salvo cuando `mustChangePassword` es true:
ahí el usuario está usando una temporal que el admin le dictó y pedírsela otra
vez es fricción sin ganancia.

**(b) Invalidar los tokens de los demás dispositivos.** Un JWT no se revoca del
lado del servidor, y este proyecto ya resolvió eso una vez con el flag `revoked`.
Aplica el mismo patrón: una columna `User.passwordChangedAt`, comparada contra
`token.iat` dentro de la revalidación que el callback `jwt` ya hace.

Dos matices que van en el comentario, no en un documento aparte:

- La revalidación corre cada `REVALIDATE_INTERVAL_MS` (60 s), así que la
  expulsión tarda hasta un minuto. Es aceptable; que quede escrito.
- `token.iat` está en segundos y `passwordChangedAt` en milisegundos. Es el
  error de una línea que hace que esto no funcione y que ninguna prueba unitaria
  detecta si la escribes con el mismo malentendido.

**(c) Política de contraseñas.** Mínimo **12** caracteres y `zxcvbn-ts` con
puntaje mínimo 3. Que el mensaje de error diga qué falta, no "contraseña
inválida": una política que no explica cómo cumplirla produce `Password123!` en
todas las cuentas.

**Pruebas obligatorias de esta fase**, contra base real:

- Cambiar la contraseña con la actual equivocada falla.
- Con `mustChangePassword` true no se pide la actual.
- Un token emitido antes del cambio queda revocado después de la revalidación.
- Un token emitido después sigue vivo.

---

## Fase 3 — Recuperación de contraseña

Sin esto, un dueño que olvida su contraseña es una llamada de soporte que sólo
tú puedes atender, con un `UPDATE` a mano.

Tabla nueva `PasswordResetToken`: hash del token (nunca el token), `userId`,
`expiresAt` de 30 minutos, `usedAt`, `createdAt`. Un token, un uso.

Tres reglas que hacen que esto no se convierta en un oráculo:

- **La respuesta es idéntica exista o no la cuenta.** "Si ese correo está
  registrado, te llegará un enlace." Sin excepción y sin diferencia de tiempo
  perceptible.
- **Límite por correo y por IP**, con `isScopeRateLimited`, que ya existe.
- **Usar el token invalida los demás** de ese usuario y sella
  `passwordChangedAt`, así que también cierra las sesiones abiertas. Es la misma
  puerta de la Fase 2 y tiene que usar el mismo código, no una copia.

**El envío depende del módulo 11**, que todavía no existe. Deja el flujo
completo escrito **encolando un `NotificationJob`** con `templateKey`
`password.reset`. En cuanto el worker exista, funciona sin tocar una línea. Y en
desarrollo, que el enlace se escriba en consola para poder probarlo hoy.

---

## Fase 4 — Límite de tasa del circuito público

**Primero, saca los scopes de `LoginAttempt`.** Esa tabla guarda intentos de
login y también contadores genéricos en su columna `email`, con un contrato
—"un scope nunca contiene arroba"— impuesto con un `throw`. Ese arreglo ya
provocó un bug real una vez (commit `9f80c20`). Tabla propia:

```prisma
model RateLimitCounter {
  id        String   @id @default(cuid())
  scope     String
  key       String
  createdAt DateTime @default(now())

  @@index([scope, key, createdAt])
}
```

La migración mueve las filas de scope que existan, y `assertValidScope`
desaparece: sin columna compartida no hay contrato frágil que imponer.

**Después, los scopes que faltan:**

| Scope | Límite | Ventana |
|---|---|---|
| `order:create` | 5 | 15 min |
| `cart:mutate` | 60 | 15 min |
| `payment:intent` | 10 | 15 min |
| `password:reset` | 5 | 60 min |

Dos criterios que ya usa el módulo de reservaciones y que hay que respetar aquí:

- **Se cobra la cuota al éxito, no al intento**, donde el intento fallido no es
  el daño. Un cliente que choca tres veces con un carrito que se le vació no
  puede quedarse una hora sin poder pedir.
- **La respuesta de "estás limitado" no puede ser distinguible** de la respuesta
  normal de error, o se convierte en una forma de sondear el sistema.

**Purga.** Un comando `tsx scripts/purge-rate-limits.ts` que borre lo que ninguna
ventana puede ya leer. Sin él la tabla sólo crece. Documéntalo en `AGENTS.md`
junto a los demás comandos.

---

## Fase 5 — Roles, último administrador y bitácora

**(a) No se puede desactivar al último administrador.** Antes de desactivar,
contar membresías activas con rol `BUSINESS_ADMIN` o superior; si queda una,
rechazar con `last_admin`. `setTeamMemberActiveAction` ya impide que un admin se
desactive a sí mismo, pero no impide que dos admins se desactiven mutuamente
hasta dejar el negocio sin nadie.

**(b) Bitácora de membresías.** Mismo patrón que `OrderStatusEvent`, que ya
funciona bien:

```prisma
model MembershipEvent {
  id           String    @id @default(cuid())
  membershipId String
  changedById  String?
  fromRole     UserRole?
  toRole       UserRole?
  fromActive   Boolean?
  toActive     Boolean?
  createdAt    DateTime  @default(now())

  membership BusinessMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  changedBy  User?              @relation(fields: [changedById], references: [id], onDelete: SetNull)

  @@index([membershipId, createdAt])
}
```

Se escribe **dentro de la misma transacción** que el cambio, igual que el resto
del proyecto.

**(c) Falta la acción de cambiar el rol de un miembro.** Hoy sólo se puede crear
y activar o desactivar. Con la bitácora ya en su sitio, agrégala, con las mismas
restricciones: nadie se cambia su propio rol, y no se puede degradar al último
admin.

---

## Fase 6 — Segundo factor (para y pregúntame antes)

Esta es la fase que quiero decidir contigo, porque es la mitad del esfuerzo del
módulo y la única que se puede posponer sin dejar un hueco de seguridad
inmediato.

Un TOTP bien hecho no es "generar un código y validarlo": es alta con código de
aprovisionamiento, verificación antes de activar, ocho códigos de respaldo de un
solo uso guardados como hash, un flujo de recuperación cuando el empleado pierde
el teléfono, y una tabla más. Es un módulo pequeño metido dentro de otro.

**Investiga y dime tu recomendación con tu razón**, contestando esto:

- ¿Cuánto añade de verdad en un panel que ya tiene límite de tasa por correo y
  por IP, contraseñas de 12 caracteres con puntaje mínimo, y sesiones de 8 horas
  revalidadas cada minuto?
- ¿Qué pasa el día que un mesero pierde el teléfono a media noche del viernes?
- ¿Lo pediría un restaurante, o es una casilla que sólo importa cuando se lo
  vendes a una cadena?

Mi inclinación es **posponerlo a un módulo propio** y cerrar este con lo demás,
pero quiero tu lectura antes. **Para aquí** hasta que responda.

---

## Fase 7 — Retención de datos y aviso de privacidad

Lo primero que pregunta un cliente con abogado, y hoy no hay respuesta.

**(a) Purga.** `LoginAttempt` y `RateLimitCounter` guardan direcciones IP, que
son dato personal bajo la LFPDPPP. Nada más allá de 90 días.

**(b) Anonimización.** `guestName`, `guestEmail` y `guestPhone` de pedidos y
reservaciones con más de 24 meses se vacían. **Los importes no se tocan**: son
contabilidad y tienen que seguir cuadrando. Un comando aparte, no automático,
para que sea una decisión y no una sorpresa.

**(c) Aviso de privacidad**, enlazado desde el formulario de reservas y desde el
checkout. Qué se guarda, para qué, cuánto tiempo, y cómo pedir que se borre. Un
texto plantilla en `docs/`, no jurídico, marcado como pendiente de revisar por
alguien que sí lo sea.

**(d) Baja del boletín.** `NewsletterSubscriber` tiene `unsubscribedAt` y nadie
lo escribe. Un enlace con token que funcione sin sesión.

---

## Fase 8 — Cierre

1. `graphify` y el generador. Revisa el grado de `lib/auth/`: este módulo lo
   convierte en el vecindario más conectado del repositorio.
2. Nota de bitácora en `Marea-Bitacora/10-Endurecimiento.md`. La tabla de
   decisiones importa más que nunca aquí: la del segundo factor, la del nonce
   frente a `unsafe-inline`, y la de dónde se cobra la cuota del límite.
3. Marca "Endurecimiento de seguridad" en la checklist de
   `Grupo-1-Comida-Bebida.md`.
4. Verificación de autoría y pull request de la fase. **Sin fusionar.**

---

## Reglas técnicas

Las de siempre. Cinco propias de este módulo:

- **Cada arreglo de seguridad trae su prueba de que el ataque ya no funciona**,
  no sólo de que el camino feliz sigue vivo. Una prueba que sólo comprueba que
  el login sigue funcionando no prueba nada de lo que este módulo hace.
- **Nada de seguridad por oscuridad.** Los mensajes de error no revelan si una
  cuenta existe, si un código es válido, o por qué falló exactamente. Y los que
  colapsan casos —"no encontrado" para código inválido y para límite excedido—
  llevan comentario diciendo que es deliberado, o el siguiente lector lo
  "arregla".
- **Ninguna decisión de seguridad se toma en el cliente.** Ni una. Si el
  servidor no lo comprueba, no está comprobado.
- **Los secretos no se registran.** Ni tokens, ni hashes, ni contraseñas, ni el
  cuerpo de un webhook. Revisa lo que ya existe mientras estás ahí.
- **Todo cambio de esquema, reversible**, y dicho explícitamente en el pull
  request.

Dependencias nuevas autorizadas, sólo estas: `zxcvbn-ts`. Si la Fase 6 sale
adelante, `otpauth` se suma. Cualquier otra, pregunta.

---

## Definición de terminado

- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` limpios, con la salida pegada.
- [ ] El CI sigue en verde y la protección de rama está **activada**, con captura.
- [ ] `curl -I` sobre `/` y sobre `/admin` muestra las cinco cabeceras.
- [ ] El panel **no** se carga dentro de un iframe. Pruébalo con un HTML local.
- [ ] La CSP está aplicada, no en modo reporte, y **el pago con 3D Secure
      funciona de punta a punta**. Enséñame ese flujo completo.
- [ ] Cambiar la contraseña exige la actual, salvo con `mustChangePassword`.
- [ ] Un token emitido antes del cambio queda revocado; uno posterior no.
- [ ] Recuperación de contraseña completa, con el enlace en consola en
      desarrollo, y la misma respuesta exista o no la cuenta.
- [ ] Las cuatro acciones públicas devuelven su error al superar la cuota, y hay
      una prueba por cada una.
- [ ] `LoginAttempt` ya no guarda scopes y `assertValidScope` fue eliminada.
- [ ] No se puede desactivar al último administrador, y hay prueba.
- [ ] Todo cambio de rol o de activación queda en `MembershipEvent` con su autor.
- [ ] Los comandos de purga y anonimización existen, están documentados en
      `AGENTS.md`, y los probaste contra datos sembrados.
- [ ] Un pull request por fase, cada uno bajo 400 líneas o con su justificación.
- [ ] Todo en inglés salvo los documentos de planeación.
- [ ] El grep de autoría devuelve vacío en todas las ramas del módulo.

---

## Lo que NO debes hacer

- **No construyas el worker de notificaciones.** Módulo 11. Aquí sólo se encola
  el `NotificationJob` de recuperación y se escribe el enlace en consola.
- **No toques el flujo de pago de Stripe** más allá de lo que la CSP exija.
- **No cambies la duración de la sesión** (8 h) ni el intervalo de revalidación
  (60 s). Están razonados en `auth.ts`; si crees que hay que moverlos, dime por
  qué y para.
- **No añadas registro de auditoría general.** `MembershipEvent` es lo que este
  módulo autoriza. Una bitácora de todo es otro proyecto.
- **No implementes el segundo factor** hasta que responda la Fase 6.
- **No toques reportes, inventario, promociones ni tiempo real.** Son los
  módulos 12 en adelante.
- **No retraduzcas** los documentos en español.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` y `/security-review` al cerrar
**cada** fase — es el módulo donde eso deja de ser una formalidad.

**Para al final de la Fase 6** con tu recomendación sobre el segundo factor y
espera mi respuesta. En lo demás, avanza de corrido, abriendo el pull request de
cada fase antes de empezar la siguiente.

Y recuerda lo del principio: ten probada tu vía de regreso al panel **antes** de
empezar la Fase 2, no cuando la necesites.
