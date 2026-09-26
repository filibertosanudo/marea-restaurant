# Prompt para Claude Code — Módulo 17: multi-sucursal

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **Para al final de la Fase 1** con las respuestas de
> alcance. Es la parada más importante de todo el plan.

---

El módulo 16 dejó el sistema aguantando: 36,300 consultas por hora bajaron a
120, el payload por evento pasó de 64 KB a 680 bytes, y hay una prueba de carga
con sus cifras. Lo construido funciona y rinde.

Este módulo responde a una pregunta distinta: **¿se puede vender dos veces?**

Hoy no. `lib/business.ts:7` lee `process.env.BUSINESS_SLUG` y devuelve una fila
fija. Cada cliente nuevo es un despliegue nuevo, con su base, su contenedor y su
mantenimiento. Eso no es un producto, es una consultoría con costo marginal
alto: el décimo cliente cuesta lo mismo que el primero.

**La buena noticia es que el esquema lleva esperando este módulo desde el primer
día.** El comentario de cabecera de `schema.prisma` lo dice: `businessId` está en
toda tabla de negocio *"no porque hoy la necesites, sino porque agregarla después
sobre tablas con millones de pedidos es una migración dolorosa"*. El trabajo está
en el runtime, no en la base.

**La mala es el tamaño del runtime.** `getCurrentBusiness()` tiene **97 llamadas
en 49 archivos**, y `session.user.businessId` —que el JWT lleva y revalida cada
60 segundos desde el módulo 10— **no se usa en ninguna parte**. Ese es el
refactor.

Y hay tres cosas que los módulos anteriores dejaron atadas a un solo negocio sin
que importara, y que aquí se vuelven fugas:

- **`BUSINESS_ROW_CACHE_SCOPE` en `lib/business.ts` es una constante de módulo**
  derivada del slug del entorno. Con dos negocios, dos filas distintas comparten
  etiqueta de caché.
- **El hub de tiempo real del módulo 16** escucha un canal de Postgres y
  multiplexa. `NOTIFY` no distingue negocios: un solo proceso recibe los eventos
  de todos y tiene que filtrarlos antes de emitir. Si no lo hace, una sucursal ve
  los pedidos de otra.
- **Stripe usa una sola llave global.** `lib/stripe/client.ts` lee
  `STRIPE_SECRET_KEY` directo del entorno, mientras `Business.stripeAccountId` y
  `Business.stripePublishableKey` llevan dos años en el esquema sin usarse. Con
  dos restaurantes, **¿a la cuenta de quién llega el dinero?**

Lee antes de empezar: el comentario de cabecera de `prisma/schema.prisma`,
`docs/DATABASE.md` §4 (el párrafo de RLS, que el módulo 7 reencuadró),
`docs/CONVENCIONES.md`, `AGENTS.md` y `docs/PLAN-PRODUCCION.md` fase 7.

---

## Cómo trabajar

Como siempre: **todo en inglés** salvo los documentos de planeación, **un pull
request por fase** con ramas encadenadas, autoría exclusivamente tuya, cero
emojis, y `git diff --stat main..HEAD` antes de abrir cada pull request.

```bash
gh pr list --state open
git switch main && git pull
git switch -c feature/tenancy-fase-0 main
```

**El criterio de este módulo:** una fuga entre negocios es el peor fallo que
puede tener este sistema. Peor que perder un pedido, peor que cobrar de más. Si
el restaurante A ve los pedidos del restaurante B, no hay disculpa que lo
arregle. Todo lo que sigue está ordenado por esa prioridad.

---

## Fase 0 — Tres variables que se leen mal

Tres sitios leen `process.env` directo, contra la regla que `AGENTS.md` fija
desde el módulo 7: *"every env var is read through `lib/env.ts`"*.

**0.1 — `lib/business.ts:7`**, `BUSINESS_SLUG`. Además ni siquiera está
declarada en `lib/env.ts`, así que un despliegue con el slug mal escrito arranca
bien y falla en la primera visita, que es justo lo que `lib/env.ts` existe para
impedir. Muévela ahí aunque esté a punto de desaparecer en la Fase 2: el módulo
podría quedarse a medias y no quiero heredar el hueco.

**0.2 — `lib/stripe/client.ts` y el webhook**, con `STRIPE_SECRET_KEY` y
`STRIPE_WEBHOOK_SECRET`. Muévelas también. Y déjalo preparado, porque la Fase 1
puede convertirlas en algo por negocio.

**0.3 — Las dos verificaciones de infraestructura** —SMTP real e impresora
térmica física— siguen abiertas. Confírmalo y no las resuelvas tú.

**0.4 — Limpieza de ramas fusionadas.**

---

## Fase 1 — Decisiones de alcance (para y espera respuesta)

Cinco preguntas. Las dos primeras cambian qué producto es esto; las otras tres
cambian cuánto trabajo es.

**1. ¿Cadena o plataforma?** Son dos productos distintos que este módulo podría
construir:

- **Cadena:** un dueño con tres sucursales. Todas suyas, comparten marca, menú y
  empleados. El aislamiento importa por higiene, no por seguridad.
- **Plataforma:** restaurantes sin relación entre sí compartiendo un despliegue.
  El aislamiento es la característica principal y una fuga es el fin del negocio.

El plan da por hecho que llegas a la segunda —es lo que hace que el costo
marginal baje— pero la primera es mucho menos trabajo y puede ser lo que pida tu
primer cliente real. **Dime cuál construimos.** El resto del módulo depende de
esto más que de ninguna otra cosa.

**2. Stripe.** Esta es la que puede bloquear el módulo entero, así que
investígala de verdad antes de contestar:

- Con **una sola cuenta** (la tuya o la de la cadena), el dinero de todos los
  restaurantes cae en el mismo sitio y tú lo repartes. Simple de construir,
  complicado de operar, y en cuanto son terceros sin relación contigo te
  conviertes en intermediario de pagos, que tiene implicaciones legales que no
  quiero descubrir después.
- Con **Stripe Connect**, cada negocio tiene su cuenta y su onboarding, el dinero
  llega directo, y tú cobras tu comisión por encima. Es lo correcto para la
  opción "plataforma" y es más trabajo: onboarding, cuentas pendientes de
  verificación, webhooks por cuenta.

`Business.stripeAccountId` y `Business.stripePublishableKey` están en el esquema
desde el principio, lo cual sugiere que la intención original era Connect.
Confírmame qué implica cada camino y cuál recomiendas. Si el veredicto es que
Connect es un módulo propio, **dilo** y sacamos los pagos multi-negocio de aquí.

**3. Cómo se resuelve el negocio en la parte pública.** Subdominio
(`marea.tuapp.com`), dominio propio (`reservas.marea.mx`), o ruta
(`tuapp.com/marea`). El esquema ya tiene `Business.slug`; el dominio propio
necesita una columna y certificados por dominio, que es trabajo de
infraestructura real. ¿Cuál en la v1 y cuál después?

**4. Qué se comparte entre sucursales de una misma cadena.** Mi propuesta, para
que la critiques:

| Entidad | Propuesta |
|---|---|
| Menú, categorías, modificadores | **Independientes por sucursal en la v1.** La herencia con sobreescritura de precio es lo que hace toda cadena real, y es mucho más trabajo del que parece |
| Mesas, pedidos, reservaciones, pagos, cortes, inventario | Estrictamente por sucursal, sin discusión |
| Promociones | Por sucursal en la v1 |
| Empleados | Un usuario, varias membresías. `BusinessMembership` ya lo soporta tal cual |

**5. El rol que falta.** Un dueño de cadena necesita ver sus tres sucursales sin
ser `SUPER_ADMIN`, que es tu rol de operador de la plataforma. ¿`ORG_ADMIN` entre
`BUSINESS_ADMIN` y `SUPER_ADMIN`? `getEffectiveRole` está aislado en su propio
módulo justo para que este cambio sea local.

**Para aquí** con las cinco respuestas.

---

## Fase 2 — Resolver el negocio por petición

El refactor: 97 llamadas en 49 archivos.

```ts
export const getBusinessForRequest = cache(async (): Promise<Business> => {
  // Panel: lo dice la sesión. El JWT ya lleva businessId y ya se revalida
  // contra la membresía cada 60 s — la pieza difícil está construida desde
  // el módulo 10 y nunca se usó.
  const session = await getSession();
  if (session?.user?.businessId) return byId(session.user.businessId);

  // Público: subdominio o dominio, según la Fase 1.
  const host = (await headers()).get("host") ?? "";
  return byHost(host);
});
```

**Cómo hacerlo sin romper nada:** marca `getCurrentBusiness` como `@deprecated`,
introduce la nueva, y **migra por módulo de dominio, un commit por módulo** —
menú, pedidos, reservaciones, pagos, mesas, reportes, caja. Noventa y siete
llamadas en un commit es un diff que nadie revisa. Al final, cuando no quede
ninguna, la borras y `BUSINESS_SLUG` desaparece del entorno.

**La matriz de permisos automatizada del módulo 9 es tu red.** Si una ruta se
quedó atrás, ahí se ve.

**Y arregla las dos fugas que los módulos anteriores dejaron latentes**, en sus
propios commits:

- **`BUSINESS_ROW_CACHE_SCOPE`** deja de ser una constante de módulo. Todas las
  etiquetas de caché del módulo 16 llevan ya `:<businessId>`; ésta tiene que
  seguir el mismo patrón.
- **El hub de tiempo real filtra por negocio antes de emitir.** Un solo proceso
  recibe los `NOTIFY` de todos. Esto no es una optimización: es la fuga más
  grave que puede tener el sistema, y merece su propia prueba de integración —
  dos negocios, un hub, y afirmar que los eventos de uno no llegan al otro.

---

## Fase 3 — Row Level Security

La red de seguridad, equivalente a lo que la `EXCLUDE` constraint es para
reservaciones: que un bug de consulta **no pueda** cruzar datos entre negocios.

```sql
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order"
  USING ("businessId" = current_setting('app.business_id', true));
```

**Tres trampas, y la primera invalida todo el trabajo si te la saltas:**

1. **RLS no aplica al dueño de las tablas ni a un superusuario.** Hoy
   `docker-compose.yml` conecta con el mismo usuario `marea` que creó el
   esquema, así que las políticas **no harían absolutamente nada** y todo
   parecería funcionar. Hace falta un rol `marea_app` con permisos mínimos para
   la aplicación, y que las migraciones sigan corriendo con el dueño. Es un
   cambio de despliegue además de uno de base de datos: `docs/DEPLOY.md` y el
   Compose se actualizan en el mismo pull request.
2. **`set_config(..., true)` es local a la transacción.** Fuera de una
   transacción no sirve, y con un pool sería peor que nada: heredarías el valor
   del tenant anterior. Toda consulta acotada tiene que ir dentro de una
   transacción que fije la variable primero.
3. **RLS es defensa en profundidad, no sustituto del filtro.** Se sigue
   escribiendo `where: { businessId }` en las consultas. La política es la que
   te salva el día que se te olvide.

**La prueba que cierra esta fase:** una que desactive a propósito el filtro de
la consulta e intente leer un pedido de otro negocio con una sesión válida, y
**falle por la política**. Sin esa prueba, RLS es una casilla marcada que nadie
verificó.

Y una pregunta que quiero que contestes aquí: **el hub de tiempo real y el
worker de notificaciones corren fuera del ciclo de petición.** ¿Cómo se acotan?
Un worker que procesa la cola de todos los negocios no puede fijar un
`app.business_id`. Dime tu solución antes de escribirla.

---

## Fase 4 — La organización y el rol

Según la respuesta a la Fase 1(5):

```prisma
model Organization {
  id         String     @id @default(cuid())
  name       String
  slug       String     @unique
  createdAt  DateTime   @default(now())
  businesses Business[]
}
```

Más `Business.organizationId String?` y el rol nuevo. Y lo que le da sentido: un
**reporte consolidado** de las sucursales de una organización, reutilizando la
agregación del módulo 12 en vez de escribir una segunda.

El cambio de negocio activo en el panel es parte de esto: un usuario con
membresías en dos sucursales cambia entre ellas **sin volver a autenticarse**.
Eso toca el JWT, así que hazlo con cuidado y con pruebas: el token nuevo tiene
que pasar por la misma revalidación contra la membresía que el módulo 10
construyó, o acabas de inventar una forma de que alguien se asigne un negocio
que no es suyo.

---

## Fase 5 — Sembrar y operar más de uno

Lo que hace que el módulo sirva en vez de sólo compilar:

- **El seed crea dos negocios**, no uno. Es la única forma de que las pruebas de
  aislamiento sean reales y de que veas las fugas antes que un cliente.
- **Los scripts de mantenimiento** —purga, anonimización, barrido de medios,
  contador de folios— se revisan uno por uno: los escribieron módulos que
  asumían un solo negocio.
- **`docs/DEPLOY.md`** explica cómo se da de alta un negocio nuevo en un
  despliegue existente. Si ese procedimiento requiere que tú entres a la base,
  el módulo no terminó su trabajo.

---

## Fase 6 — Cierre

1. `graphify` y el generador. El grado de `getBusinessForRequest` debería ser
   parecido al que tenía `getCurrentBusiness`; si es mucho menor, alguna ruta se
   quedó sin migrar.
2. Nota de bitácora en `Marea-Bitacora/17-Multi-sucursal.md`, con las cinco
   respuestas de la Fase 1 y la del worker de la Fase 3.
3. Actualiza `Grupo-1-Comida-Bebida.md` y el plan.
4. Verificación de autoría y pull request. **Sin fusionar.**

---

## Reglas técnicas

Las de siempre. Seis propias del módulo:

- **Ninguna consulta nueva sin `businessId`.** Ninguna.
- **Ninguna clave de caché sin el negocio dentro.**
- **Nada que cruce el ciclo de petición asume un negocio.** Worker, hub, agente
  de impresión, scripts: todos reciben el negocio explícitamente.
- **Las políticas de RLS van en migraciones escritas a mano**, con su comentario,
  como la `EXCLUDE` y como los triggers del módulo 16.
- **El aislamiento se prueba, no se declara.** Cada fase que toque datos deja al
  menos una prueba que intenta cruzar la frontera y falla.
- **Migrar por módulo de dominio**, un commit cada uno. Nunca las 97 de golpe.

Dependencias nuevas: **ninguna autorizada**, salvo lo que la respuesta de Stripe
de la Fase 1 obligue, y eso lo apruebo yo.

---

## Definición de terminado

- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` limpios, con la salida.
- [ ] CI en verde, cobertura dentro de umbral, **ninguna prueba existente cambió
      de resultado**.
- [ ] El seed crea dos negocios y las pruebas de aislamiento corren contra los dos.
- [ ] Dos negocios con sus dominios, sin una sola fuga de datos.
- [ ] Una prueba desactiva el filtro de una consulta e intenta leer de otro
      negocio: **falla por RLS**.
- [ ] La aplicación **no** conecta como dueño de las tablas. Compruébalo y
      enséñame la salida.
- [ ] El hub de tiempo real no emite un evento de un negocio a un cliente de
      otro, y hay prueba.
- [ ] Ninguna etiqueta de caché se comparte entre negocios.
- [ ] Un usuario con membresías en dos sucursales cambia entre ellas sin volver
      a autenticarse, y no puede asignarse una que no es suya.
- [ ] `getCurrentBusiness` no existe y `BUSINESS_SLUG` no está en el entorno.
- [ ] `grep -rn "process.env" lib/ app/` sólo encuentra `lib/env.ts` y los
      `NODE_ENV` de las cookies.
- [ ] `docs/DEPLOY.md` explica cómo dar de alta un negocio sin tocar la base.
- [ ] La prueba de carga del módulo 16 sigue pasando, ahora con dos negocios.
- [ ] Un pull request por fase, todos con la plantilla llena, ninguno fusionado.
- [ ] Todo en inglés salvo los documentos de planeación.
- [ ] El grep de autoría devuelve vacío en todas las ramas.

---

## Lo que NO debes hacer

- **No construyas herencia de menú entre sucursales** salvo que la Fase 1 lo
  apruebe explícitamente.
- **No particiones `Order`.** El plan fija el criterio numérico y no estamos
  cerca.
- **No construyas onboarding autoservicio, facturación ni cobro de la
  suscripción.** Módulo 18, el último.
- **No toques el tiempo real** más allá del filtro por negocio.
- **No hagas de `SUPER_ADMIN` un rol de cadena.** Es el operador de la
  plataforma y tiene que seguir siéndolo.
- **No migres las 97 llamadas en un commit.**
- **No retraduzcas** los documentos en español.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase y
**`/security-review` en todas**, sin excepción: este módulo entero es una
superficie de fuga entre clientes.

**Una parada, la más importante del plan:** al final de la Fase 1, con las cinco
respuestas. Tómate el tiempo de investigar Stripe de verdad antes de contestar
la segunda; es la única que puede cambiar el alcance del módulo entero.
