# Prompt para Claude Code — Módulo 9: integración continua y pruebas

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **No para a esperar diseño** —no hay pantallas—
> pero sí hay una decisión en la Fase 2 que quiero responder yo.

---

Los módulos 7 y 8 dejaron el sistema desplegable en cualquier parte y el
generador de documentación en orden. Lo que sigue es la deuda que la auditoría
puso en primer lugar y que sigue intacta: **nada impide que un cambio equivocado
llegue a `main`.**

No es una exageración. Hoy el repositorio tiene diez archivos de prueba y todos
cubren funciones puras: disponibilidad, esquemas, horarios, códigos de mesa,
validación de entorno, detección de tipo de imagen. Son buenas pruebas. Y no hay
una sola sobre las cuatro cosas que, si se rompen, cuestan dinero de verdad:

- `createOrderFromCart`, que congela precios, descuenta inventario y bloquea el
  carrito para que un doble clic no genere dos pedidos.
- El webhook de Stripe, el único sitio del sistema que marca un pago como
  cobrado.
- `board-actions`, que cancela pedidos, devuelve inventario y cobra en efectivo.
- `requireRole`, que es lo único entre un mesero y el botón de reembolsar.

Tampoco existe `.github/workflows/`. Nada corre `tsc`, `eslint` ni `vitest`
antes de una fusión. La protección de rama no puede exigir algo que no existe.

Este módulo construye esa red. Después de él, cada módulo que venga —reportes,
inventario, promociones, multi-sucursal— se apoya en ella. Antes de él, cada uno
es una apuesta.

Lee antes de empezar: `docs/CONVENCIONES.md` (cambió: ahora hay una sección 0 de
idioma y la sección 6 se reescribió entera), `AGENTS.md`, y
`docs/PLAN-PRODUCCION.md` fase 1, de donde sale este prompt.

---

## Cómo trabajar

`docs/CONVENCIONES.md` manda. Tres cosas cambiaron desde el módulo 8 y afectan
directamente a cómo se entrega este:

**1. Todo en inglés.** Código, nombres, comentarios, mensajes de commit, títulos
y descripciones de pull request, nombres de rama, y los documentos operativos del
repositorio. Los documentos de planeación —este prompt, el plan, las
convenciones, `docs/DATABASE.md`— siguen en español y **no se retraducen**.
Sección 0 de las convenciones.

**2. Un pull request por fase, no por módulo.** El módulo 7 fueron 52 commits en
una sola rama: eso no se revisa, se aprueba por cansancio. El techo es 400 líneas
por pull request. Las fases de abajo ya están cortadas para caber.

Ramas encadenadas, cada una desde la anterior:

```bash
gh pr list --state open          # vacío antes de empezar el módulo
git switch main && git pull

git switch -c feature/ci-fase-0 main
# fase 0 → pull request contra main

git switch -c feature/ci-fase-1 feature/ci-fase-0
# fase 1 → pull request contra feature/ci-fase-0
```

"No se empieza con un pull request abierto" aplica a **empezar el módulo**, no a
la fase siguiente del mismo módulo. Sube cada fase, abre su pull request, y sigue
con la siguiente encima.

**3. Autoría.** Author y committer son Filiberto Sañudo, siempre. Ni un trailer
de coautoría, ni una mención de con qué herramienta se escribió nada, en ningún
commit, comentario, documento o pull request. Antes de cada pull request:

```bash
git log <rama-base>..HEAD --pretty="%an|%cn|%s|%b" \
  | grep -Ei "claude|copilot|chatgpt|co-authored|generated with|assisted"
```

Vacío o no se abre.

Y no olvides `git config core.hooksPath .githooks` en este clon.

---

## Fase 0 — Lo que quedó a medias en los dos módulos anteriores

Cinco cosas, cada una su commit. Ninguna es grave; las cinco estorban justo para
lo que hace este módulo.

**0.1 — El workspace quedó a medio partir.** `packages/ui/package.json` declara
`main`, `module` y `types` apuntando a `../../dist/...`, y su `build:lib` escribe
con `--out-dir ../../dist`. Un paquete que se construye fuera de su propio
directorio no es un paquete: `npm pack` sobre él no empaqueta nada, el `dist/`
raíz está en `.gitignore`, y el `build:css` de la raíz sigue leyendo
`./styles/lib.css` para escribir `./dist/styles.css` mientras los componentes ya
viven en `packages/ui/src`.

Termínalo: la salida va a `packages/ui/dist`, los campos del manifiesto apuntan
ahí, y `styles/lib.css` se muda con sus componentes. Si algo lo impide —el
`.design-sync` que publica a Claude Design, por ejemplo— **para y dime** en vez
de forzarlo.

**0.2 — `tsup` sigue en las dependencias de la raíz** aunque sólo lo use
`packages/ui`. Se mueve a las suyas.

**0.3 — `test/setup.ts` inyecta un `DATABASE_URL` falso para todas las
pruebas.** Hoy hace falta, porque cualquier módulo que importe `lib/env` fallaría
si no. En cuanto existan pruebas de integración, ese `??=` es exactamente lo que
va a hacer que apunten a una base que no existe y que el fallo se lea como un
error de conexión en vez de como lo que es. El arreglo va en la Fase 1 junto con
la separación de proyectos, pero **anótalo aquí y no lo pierdas**.

**0.4 — Un solo proyecto de vitest.** `vitest.config.mts` no distingue unidad de
integración, y son cosas distintas: unas corren en milisegundos sin nada
alrededor, las otras necesitan un Postgres y no pueden correr en paralelo sin
aislamiento. Se separan en la Fase 1.

**0.5 — El hook depende de que alguien lo active.** `git config core.hooksPath
.githooks` es un paso manual por clon, y nada lo verifica. No lo quites —sigue
siendo la manera barata de fallar rápido— pero el CI tiene que validar el formato
de los mensajes por su cuenta, porque un clon sin el hook los deja pasar.

---

## Fase 1 — Integración continua

`.github/workflows/ci.yml`, en inglés, disparado en `pull_request` y en push a
`main`.

**Trabajo `check`** — rápido, sin base de datos: `npm ci`, `prisma generate`,
`tsc --noEmit`, `eslint`, y las pruebas unitarias.

**Trabajo `integration`** — con un servicio `postgres:17`, `prisma migrate
deploy`, y las pruebas de integración. Fíjate en dos cosas que se olvidan y
cuestan media hora cada una:

- El `healthcheck` del servicio, o los primeros pasos corren contra una base que
  todavía no acepta conexiones.
- La extensión `btree_gist`, que la migración `reservation_no_overlap` necesita.
  Si el usuario del servicio no puede crear extensiones, la migración falla y el
  error no dice eso.

**Trabajo `commits`** — valida el formato de los mensajes del pull request con la
misma lógica del hook. No dupliques las reglas en dos sitios: extrae el
validador a `scripts/` y que hook y CI lo llamen. Un contrato escrito dos veces
se desincroniza en el segundo cambio.

**Aviso de tamaño de pull request.** Un paso que compare las líneas cambiadas
contra `main` y **avise** —no falle— pasando de 400. Es un recordatorio, no una
puerta: hay fases que legítimamente no se pueden partir.

**Caché de npm** con `actions/setup-node`. Sin caché el CI tarda tres veces más y
la gente empieza a saltárselo, que es como mueren los CI.

**Separa los proyectos de vitest** en el mismo commit que lo necesita: `unit`
(entorno node, sin base) e `integration` (con base). `npm test` corre los dos;
`npm run test:unit` y `npm run test:integration` corren uno. El `setup.ts` actual
pasa a ser el del proyecto `unit` únicamente; integración usa el `DATABASE_URL`
de verdad y **falla si no está**, en vez de inventarse uno.

**Protección de rama.** No la puedes configurar tú, es de la interfaz de GitHub.
Déjame las instrucciones exactas en `docs/CONVENCIONES.md`: qué checks marcar
como obligatorios y qué casillas activar.

---

## Fase 2 — Infraestructura de pruebas de integración

Aquí está la única decisión que quiero tomar yo.

**El aislamiento entre pruebas.** Tres opciones razonables:

1. **Un esquema de Postgres por worker de vitest**, migrado una vez y truncado
   entre pruebas. Rápido, permite paralelismo real.
2. **Una transacción por prueba con rollback al final.** Más rápido todavía, pero
   rompe con cualquier código que abra su propia transacción, y este proyecto
   está lleno de `$transaction` y `FOR UPDATE`. Probablemente descartable, pero
   quiero tu lectura.
3. **`TRUNCATE` global entre pruebas**, sin paralelismo. Simple y lento.

Me inclino por la primera. **Propón con tu razón y espera mi respuesta** antes de
escribir el arranque. Lo demás de esta fase puedes irlo haciendo mientras.

**Factories.** Un módulo `test/factories.ts` con `makeBusiness`, `makeMenuItem`,
`makeModifierGroup`, `makeCart`, `makeOrder`, `makeStaff(role)`, cada una con
valores por defecto sensatos y sobrescritura parcial. Sin esto, cada prueba
empieza con cuarenta líneas de preparación y nadie escribe la segunda.

**Reglas para las factories:** crean lo mínimo indispensable, no un negocio
entero; devuelven la fila creada; y **nunca** se les pone lógica condicional. Una
factory con `if` es una prueba escondida en el sitio equivocado.

**Un helper de concurrencia.** Varias de las pruebas de la Fase 3 son "dos
llamadas simultáneas". Escríbelo una vez, bien, con `Promise.allSettled` y sin
`setTimeout` para sincronizar: un test que depende de un temporizador falla en el
CI un martes cualquiera y nadie sabe por qué.

---

## Fase 3 — Las pruebas del dinero

La regla de las convenciones, aplicada: nada que toque dinero se fusiona sin
prueba de integración. Esta fase la paga por adelantado para todo lo que ya
existe.

**`createOrderFromCart`.** La función más importante del sistema.

- Precio congelado: cambiar `basePrice` después de meter el platillo al carrito y
  verificar que el `OrderItem` guarda el precio de cuando se ordenó.
- Impuesto sobre un caso con decimales feos, no sobre un número redondo.
- **Doble envío concurrente:** dos llamadas simultáneas con la misma cookie de
  carrito producen **un solo pedido**; la segunda recibe `empty_cart`. Esto es lo
  que prueba que el `FOR UPDATE` sobre `Cart` sirve para lo que se puso.
- Inventario: dos checkouts concurrentes sobre un platillo con `stockQuantity: 1`
  → uno pasa, el otro recibe `item_unavailable`, y el stock nunca queda negativo.
- Platillo dado de baja, categoría desactivada, modificador no disponible, y un
  grupo que se volvió obligatorio mientras el carrito estaba abierto.
- El `NotificationJob` se crea dentro de la transacción: si el pedido falla, no
  queda un job huérfano prometiendo un correo de algo que no pasó.

**El webhook de Stripe.**

- Firma inválida → 400, y **ningún** efecto en la base.
- Reenvío del mismo `event.id` → el efecto se aplica una vez; la segunda llamada
  responde 2xx sin tocar nada. Es el escenario real: Stripe reenvía.
- `payment_intent.succeeded` sobre un intent desconocido → no-op silencioso.
- `charge.refunded` parcial → `PARTIALLY_REFUNDED` y una fila `Refund`; total →
  `REFUNDED`.
- Un cargo con más de diez reembolsos: `autoPagingToArray` los trae todos. Ese
  código existe precisamente para ese bug; que quede probado.
- Transición ilegal → se registra y no se aplica.

Necesitas firmar eventos de prueba. `stripe.webhooks.generateTestHeaderString`
lo hace sin salir a la red; no montes un mock del SDK entero.

**`board-actions`.**

- `advanceOrderStatusAction` respeta la máquina de estados y rechaza un salto.
- `cancelOrderAction` con un platillo que lleva inventario **devuelve el stock** y
  restaura `isAvailable` si había cruzado a cero.
- `collectCashPaymentAction` sobre un pedido ya liquidado con tarjeta →
  `already_settled`.
- Cobro y cancelación concurrentes: uno gana, el otro falla limpio. Nunca un
  pedido cancelado y cobrado a la vez.

---

## Fase 4 — Permisos y reservaciones

**La matriz de permisos, dirigida por tabla.** `docs/product/roles-y-alcance.md`
ya tiene la matriz escrita en prosa. Conviértela en datos: un arreglo de
`{ action, role, allowed }` y un solo `it.each`. Un archivo, unas ciento veinte
líneas, y es lo que evita que una acción nueva se publique sin `requireRole`.

Incluye los dos casos que `requireRole` contempla y que nadie recuerda: sesión
con `revoked: true` y sesión con `mustChangePassword: true`. Las dos tienen que
ser rechazadas aunque el rol sea correcto.

**Reservaciones contra la constraint.** Las pruebas unitarias de
`availability.ts` son excelentes y no se tocan. Falta la que sólo una base real
puede dar: dos `createReservationAction` concurrentes sobre el mismo hueco → uno
crea y el otro recibe `slot_taken` **por la `EXCLUDE` constraint**, no por el
chequeo previo. Para forzarlo, salta el pre-chequeo o corre las dos llamadas tan
cerca que ambas lo pasen.

Esa prueba es la que demuestra que la garantía más valiosa del sistema es real y
no una promesa del código de aplicación.

---

## Fase 5 — Cobertura y humo

**Umbral de cobertura que rompe el CI.** `@vitest/coverage-v8`:

| Ruta | Líneas |
|---|---|
| `lib/orders/**`, `lib/payments/**`, `lib/reservations/**` | 90% |
| Resto de `lib/**` | 70% |
| `components/**`, `app/**` | sin umbral |

Sin umbral en componentes a propósito: cubrir JSX con pruebas unitarias da
métrica y no da confianza. Lo que cubre la interfaz son los tres flujos de abajo.

**Tres pruebas de extremo a extremo con Playwright. Tres, no veinte.**

1. Reservar desde la landing, recibir el código, consultarlo en `/r/<código>`,
   cancelarlo.
2. Abrir `/t/<qrToken>`, agregar dos platillos con modificadores, hacer checkout,
   llegar a `/o/<publicToken>`.
3. Entrar como STAFF, avanzar ese pedido a `READY`, y comprobar que la pantalla
   pública del pedido lo refleja.

Tres flujos cubren el grueso del riesgo de integración de la interfaz. Veinte se
vuelven un segundo trabajo de mantenimiento y terminan desactivados, que es peor
que no tenerlos porque además dan una falsa sensación de cobertura.

Corren contra el `docker-compose.yml` del módulo 7. En CI, en su propio trabajo,
y con el reporte subido como artefacto cuando fallan: un E2E que falla sin traza
no se arregla, se ignora.

---

## Fase 6 — Cierre

1. `graphify` y el generador. Ahora limpia solo, así que revisa que no quede nada
   raro y compara el conteo.
2. Nota de bitácora en `Marea-Bitacora/09-Integracion-continua-y-pruebas.md`, con
   la plantilla del índice. Aquí importa especialmente la tabla de decisiones: la
   del aislamiento de la Fase 2 y la del umbral de cobertura.
3. Actualiza la checklist de `Grupo-1-Comida-Bebida.md`: "Pruebas automatizadas e
   integración continua" pasa a marcada.
4. Verificación de autoría, y pull request de la fase. **Sin fusionar.**

---

## Reglas técnicas

Las de siempre. Cinco propias de este módulo:

- **Una prueba que no falla cuando rompes el código no es una prueba.** Por cada
  bloque nuevo, rompe a propósito lo que protege, comprueba que se pone en rojo,
  y deshazlo. Si no se pone en rojo, la prueba está mal escrita.
- **Sin `setTimeout` para sincronizar.** Ni en las pruebas de concurrencia ni en
  los E2E. Los tests que dependen del reloj fallan un martes cualquiera en el CI
  y erosionan la confianza en toda la suite.
- **Nada de mocks de Prisma.** Las pruebas de integración corren contra un
  Postgres real. Un mock de Prisma prueba que el mock funciona.
- **Las pruebas también son código en inglés**, incluidos los nombres de los
  `describe` y los `it`. Sección 0 de las convenciones.
- **Las pruebas no cambian el código que prueban.** Si una función no es
  testeable, dilo y para: hacerla testeable es un cambio de comportamiento y va
  en su propio commit, no escondido dentro de un commit de `test`.

Dependencias nuevas autorizadas, sólo estas dos: `@vitest/coverage-v8` y
`@playwright/test`, ambas de desarrollo. Cualquier otra, pregunta.

---

## Definición de terminado

- [ ] `npm run lint` y `npx tsc --noEmit` limpios.
- [ ] `npm test` pasa en Windows y me pegaste la salida.
- [ ] El CI corre en cada pull request y está en verde.
- [ ] `docs/CONVENCIONES.md` dice qué checks marcar como obligatorios en la
      protección de rama de `main`.
- [ ] Un mensaje de commit mal formado es rechazado por el CI **aunque el clon no
      tenga el hook activado**.
- [ ] Rompiste a propósito una línea de `createOrderFromCart`, otra del webhook y
      otra de `requireRole`, y en los tres casos el CI se puso rojo. Enséñame las
      tres salidas.
- [ ] Dos checkouts concurrentes sobre el mismo carrito producen un solo pedido, y
      hay una prueba que lo demuestra.
- [ ] Dos reservaciones concurrentes sobre el mismo hueco chocan contra la
      `EXCLUDE` constraint, y hay una prueba que lo demuestra.
- [ ] La matriz de permisos está cubierta entera, incluidos `revoked` y
      `mustChangePassword`.
- [ ] El umbral de cobertura está activo y en verde.
- [ ] Los tres E2E corren en CI en menos de tres minutos.
- [ ] `packages/ui` se construye dentro de su propio directorio.
- [ ] **Un pull request por fase**, cada uno bajo 400 líneas o con su
      justificación escrita, todos con la plantilla llena y ninguno fusionado.
- [ ] Todo en inglés salvo los documentos de planeación en español.
- [ ] El grep de autoría devuelve vacío en todas las ramas del módulo.

---

## Lo que NO debes hacer

- **No cambies el comportamiento de nada** para hacerlo testeable sin decírmelo
  antes. Este módulo prueba lo que hay; si algo no se puede probar, esa es la
  información valiosa.
- **No añadas pruebas de componentes** con Testing Library. No es el momento y no
  es donde está el riesgo.
- **No toques `lib/reservations/availability.ts`** ni sus pruebas actuales. Están
  bien.
- **No montes el worker de notificaciones** para probar los `NotificationJob`.
  Este módulo comprueba que las filas se crean dentro de la transacción correcta,
  nada más. El worker es el módulo 11.
- **No metas cabeceras de seguridad, límites de tasa ni cambios de sesión.** Es el
  módulo 10, el siguiente.
- **Ninguna migración de esquema.** Si una prueba parece necesitarla, para y dime.
- **No añadas dependencias** fuera de las dos autorizadas.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase.
`/security-review` en la Fase 4, que es la que codifica quién puede hacer qué.

**Para al final de la Fase 2** con tu propuesta de aislamiento entre pruebas y
espera mi respuesta. Puedes seguir con las factories mientras. En lo demás,
avanza de corrido, abriendo el pull request de cada fase antes de empezar la
siguiente.
