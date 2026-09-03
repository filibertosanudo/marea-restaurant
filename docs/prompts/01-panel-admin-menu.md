# Prompt para Claude Code — Módulo 1: panel de administración + gestión de menú

> Errata (módulo 7): la subida de imágenes a Supabase Storage quedó sin efecto.
> Ver docs/PLAN-PRODUCCION.md y docs/prompts/07-postgres-y-deploy-portatil.md.

> Cópialo completo en Claude Code, dentro de `Desktop/restaurant-page`.
> Arráncalo con el skill de build loop que ya tienes: escribe
> `usa el skill build-loop-claude-code` antes de pegar esto, o pégalo tal cual
> — la última sección se lo pide explícitamente.

---

Vas a construir el **primer módulo del panel de administración de Marea**: la
autenticación, el shell del panel y la gestión completa del menú. Al terminar,
el landing debe leer su menú de la base de datos y `content.ts` debe dejar de
ser la fuente de verdad de los platillos.

Antes de escribir código, lee estos archivos del repo. No los des por sabidos:

- `AGENTS.md` — **esta versión de Next.js (16.3.1) tiene cambios de ruptura
  respecto a lo que traes de entrenamiento.** Lee las guías en
  `node_modules/next/dist/docs/` que apliquen (App Router, Server Actions,
  middleware, `params`/`searchParams`) ANTES de escribir cualquier ruta.
- `docs/design.md` — la fuente canónica del sistema de diseño. Manda sobre tu
  gusto.
- `.design-sync/conventions.md` — el idioma de estilo: tokens semánticos, nunca
  la paleta default de Tailwind.
- `prisma/schema.prisma` y `docs/DATABASE.md` — el modelo de datos y el porqué
  de cada decisión.
- `docs/product/roles-y-alcance.md` — quién puede hacer qué. **La matriz de
  permisos de ese documento es el contrato**, no la inventes de nuevo.
- `lib/prisma.ts` — el cliente ya está configurado (Prisma 7 + adapter-pg).

## Lo que ya existe y NO debes rehacer

- Landing completo en `components/marea-landing/`, con toggle EN/ES y
  claro/oscuro funcionando.
- Sistema de diseño con 12 componentes en `components/ui/` (`Button`, `Input`,
  `Select`, `Table`, `Tabs`, `Modal`, `Toast`, `Nav`, `MenuCard`,
  `TestimonialCard`, `OfferBadge`, `StatItem`), tokens en `styles/tokens.css`,
  escala semántica en `tailwind.config.ts`.
- Esquema de Prisma completo y validado, con seed del menú real.

## Fase 0 — Preflight

1. `npm run db:migrate -- --name init` y `npm run db:seed`. Si falta
   `DATABASE_URL` / `DIRECT_URL`, detente y dímelo — no inventes credenciales
   ni levantes un Postgres local sin avisar.
2. Verifica con `npm run db:studio` que hay 9 platillos y 6 categorías.
3. `npm run build` debe pasar antes de que toques nada. Si ya está roto,
   arréglalo primero y dímelo.

## Fase 1 — Diseño antes que código (no te saltes esta fase)

Un panel de administración no se ve como un landing: es denso, tabular, de uso
repetido y con estados vacíos, de carga y de error por todas partes. El sistema
actual no tiene vocabulario para eso todavía.

1. Usa el skill **`design-system`** para extender `docs/design.md` y
   `docs/design.html` con los patrones que faltan. Como mínimo:
   `AdminShell` (sidebar + topbar), `DataTable` (con orden, filtro, selección y
   paginación), `EmptyState`, `StatusBadge`, `FormField` (label + hint + error +
   estado inválido), `Drawer`/`SheetPanel` lateral para editar sin perder la
   lista, `ConfirmDialog` para acciones destructivas, `LocaleTabs` (EN/ES sobre
   un mismo campo), `Skeleton` e `ImageDropzone`.
2. Usa el skill **`design-better`** para las decisiones de craft (jerarquía,
   foco, densidad, motion, accesibilidad) de cada pantalla nueva.
3. **Todo sale de los tokens existentes.** El único azul es `primary`
   (#1B367B). Nada de `blue-600`, nada de un hex suelto. Si un patrón necesita
   un token que no existe (por ejemplo un `surface-raised` para filas alternas
   de tabla), **agrégalo a `docs/design.md` y a `styles/tokens.css` con su
   valor claro y oscuro y su verificación de contraste** — no lo pongas inline.
4. Un ajuste de densidad es válido y necesario: el landing es generoso (padding
   grande, `rounded-lg/xl`, pill en todo). El panel debe ser más apretado y más
   recto — mantén el color y la tipografía, baja el radio a `rounded-md/sm` en
   controles de tabla y reduce el espaciado. Documenta esa diferencia en
   `docs/design.md` como una variante "admin" del mismo sistema, no como un
   sistema nuevo.
5. **Arregla el pendiente que el propio `docs/design.md` deja abierto**: en modo
   claro, `border`, `surface-ocean-border` y `accent-warm-border` dan ~1.1–1.3:1
   contra su fondo, muy por debajo del mínimo de 3:1 para componentes de UI. En
   un landing se disimula; en un panel lleno de tablas y formularios es un
   defecto real de accesibilidad. Oscurécelos hasta cruzar 3:1, verifica que el
   landing sigue viéndose bien, y actualiza la tabla de contraste del doc.
6. Los componentes nuevos van en **`components/admin/`**, no en
   `components/ui/`. `components/ui/` es la librería que se publica
   (`components/index.ts` + `npm run build:lib`) y está sincronizada con el
   proyecto de Claude Design `377c620e-d085-4104-9364-b6bf837d6a18`. Cuando un
   componente admin demuestre ser genérico y estable, promuévelo a
   `components/ui/`, expórtalo en el barrel y súbelo con `/design-sync` — pero
   eso es una decisión aparte, al final, no sobre la marcha.

Enséñame las pantallas antes de construirlas. Si tienes el skill `design`
disponible, arma un canvas con los artboards de: login, layout del panel,
lista de platillos, editor de platillo y estado vacío. Si no, genera
`docs/design.html` actualizado y descríbeme cada pantalla en texto. **Espera mi
visto bueno antes de pasar a la Fase 2.**

## Fase 2 — i18n del panel

El panel también es bilingüe, con **la misma forma de claves que el landing**.

- Extrae el patrón de `components/marea-landing/content.ts` a
  `lib/i18n/dictionaries/es.ts` y `en.ts`, con el diccionario del panel bajo un
  namespace `admin`. El landing debe seguir funcionando exactamente igual — si
  hace falta, que siga importando su `STR` desde donde está y sólo comparta el
  tipo `Lang`.
- **No introduzcas un segmento de ruta `[lang]`.** El landing hoy cambia de
  idioma en cliente y las rutas del panel viven detrás de login, donde el SEO
  por idioma no vale nada. Usa el mismo enfoque: preferencia de idioma en una
  cookie (`marea-lang`), leída en el server layout, con un switch EN/ES en la
  topbar. Meter `[lang]` obligaría a reescribir el landing y no compra nada.
- El idioma del panel es independiente del idioma del **contenido** que se
  edita. Un admin puede tener el panel en español y estar escribiendo la
  descripción en inglés del platillo. No los mezcles.

## Fase 3 — Autenticación

Auth.js (NextAuth v5) con el adaptador de Prisma, que ya tiene sus modelos en el
esquema.

- **Credentials provider, correo + contraseña.** Hash con `argon2id`
  (o `bcrypt` con cost ≥ 12). El campo es `User.passwordHash`.
- **Ojo:** el Credentials provider no soporta sesiones en base de datos. Debes
  configurar `session: { strategy: "jwt" }`. La tabla `Session` queda sin usar
  hasta que agregues OAuth — no la borres.
- **Sin registro público.** No hay pantalla de "crear cuenta". Las cuentas del
  personal las crea el administrador (Fase 5, pantalla de equipo) con
  contraseña temporal y `mustChangePassword = true`, que fuerza el cambio en el
  primer login.
- El rol efectivo se resuelve en un solo lugar (`lib/auth/permissions.ts`):
  `SUPER_ADMIN` en `User.role` gana siempre; si no, el `role` de la
  `BusinessMembership` del negocio activo; si no hay membresía, `CUSTOMER`.
  Mete el rol en el JWT para no consultar la base en cada request.
- Middleware que protege `/admin/*`. Un `STAFF` que entre a `/admin` aterriza
  en `/admin/pedidos`, no en la home del panel a la que no tiene acceso.
- Autorización **también en el servidor, en cada Server Action**. Esconder un
  botón no es un permiso. Escribe un helper `requireRole(...)` y úsalo en la
  primera línea de cada mutación.
- Rate limiting básico en el login (5 intentos por correo cada 15 min) y
  mensajes de error que no revelen si el correo existe.

Siembra en el seed un admin (`admin@marea.test`) y un empleado
(`mesero@marea.test`) con contraseñas conocidas de desarrollo, y déjalas
documentadas en el README.

## Fase 4 — Shell del panel

Ruta `/admin`. Layout con sidebar colapsable + topbar.

- Navegación (los deshabilitados se ven, con candado, para que se entienda el
  alcance): Menú · Pedidos · Reservaciones · Promociones · Mesas y QR ·
  Testimonios · Equipo · Configuración.
- Topbar: buscador, switch EN/ES, toggle claro/oscuro reutilizando el mismo
  mecanismo del landing (`data-theme` + `localStorage['marea-theme']`), menú de
  usuario con cerrar sesión.
- Filtra el menú de navegación por rol, usando la matriz de
  `docs/product/roles-y-alcance.md`.
- Responsive de verdad: la sidebar colapsa a drawer en móvil. El administrador
  va a abrir esto desde el celular.
- `loading.tsx` y `error.tsx` en cada segmento de ruta. Nada de pantallas en
  blanco.

## Fase 5 — Gestión de menú

El corazón de este encargo.

**Categorías** (`/admin/menu/categorias`): lista ordenable por arrastre
(persiste `sortOrder`), crear/editar con nombre en EN y ES, activar/desactivar.
No permitas borrar una categoría con platillos: ofrece desactivarla.

**Platillos** (`/admin/menu`): tabla con foto, nombre, categoría, precio,
disponibilidad y etiquetas. Buscador, filtro por categoría y por
disponibilidad, orden por columna, paginación en servidor.

- Editor en panel lateral (drawer), no en página aparte: editar 9 platillos
  seguidos sin perder la lista es la diferencia entre un panel usable y uno que
  se abandona.
- Campos por idioma en `LocaleTabs`: nombre, descripción y texto alternativo de
  la imagen. **El idioma por defecto del negocio es obligatorio; los demás son
  opcionales pero se marcan visiblemente como incompletos** — una insignia
  "falta EN" en la fila de la tabla.
- `isAvailable` como interruptor **directo desde la fila**, con `useOptimistic`.
  Es la acción más frecuente del día y no puede costar tres clics. Es la única
  edición de catálogo permitida a `STAFF`.
- Etiquetas por multi-select, modificadores conectando/desconectando
  `ModifierGroup` existentes.
- Imagen: subida a Supabase Storage con vista previa, y campo de URL como
  alternativa. Valida tipo y tamaño en el servidor, no sólo en el cliente.
- Borrado = **soft delete** (`deletedAt`). Con `ConfirmDialog` que explique que
  el platillo desaparece del menú pero se conserva en los pedidos históricos.

**Modificadores** (`/admin/menu/modificadores`): CRUD de grupos y opciones, con
su `priceDelta`, y vista de a qué platillos está aplicado cada grupo.

**Equipo** (`/admin/equipo`): lista de miembros, alta con rol y contraseña
temporal, desactivar. Sólo `BUSINESS_ADMIN`.

## Reglas técnicas no negociables

1. **Server Components por defecto.** `"use client"` sólo donde hay estado o
   eventos, y lo más abajo posible en el árbol.
2. **Mutaciones con Server Actions**, validadas con Zod. El mismo esquema de
   Zod se comparte entre cliente y servidor; el servidor nunca confía en el
   cliente.
3. **`Prisma.Decimal` nunca cruza a un Client Component.** No es serializable y
   revienta de formas confusas. Convierte a `string` en una capa de DTO
   (`lib/dto/`) y formatea con `Intl.NumberFormat` usando la moneda del negocio.
4. **Todo query de catálogo lleva `deletedAt: null`.** Centraliza los queries en
   `lib/menu/queries.ts`; no repartas `where` por la app.
5. **`businessId` siempre desde `getCurrentBusiness()`**, jamás hardcodeado ni
   leído del cliente. Es lo único que hace que el multi-tenant no duela después.
6. Sin librerías de UI nuevas (nada de shadcn, MUI, Chakra). Lo que falte se
   construye con los tokens del sistema. Sí puedes agregar utilidades sin UI:
   `zod`, `next-auth`, `@node-rs/argon2`, y un headless de accesibilidad
   (`@radix-ui/react-*`) **sólo si lo estilizas 100% con nuestros tokens**.
7. Accesibilidad: navegable con teclado de punta a punta, foco visible, labels
   reales, `aria-live` en los toasts, contraste AA verificado. La tabla se
   navega con teclado.
8. `npm run build` y `npm run lint` limpios. Sin `any`, sin `@ts-ignore`.

## Definición de terminado

- [ ] Entro a `/admin` con correo y contraseña; sin sesión me manda a login.
- [ ] Un `STAFF` no ve ni alcanza las rutas de administrador, ni por URL directa.
- [ ] Creo un platillo con nombre y descripción en EN y ES, le pongo foto,
      precio y etiquetas, y aparece en el landing sin tocar código.
- [ ] Cambio el precio en el panel y el landing lo refleja; los pedidos del seed
      siguen mostrando el precio viejo.
- [ ] Marco un platillo como agotado desde la fila y desaparece del landing.
- [ ] Reordeno categorías arrastrando y el orden persiste.
- [ ] El panel funciona en EN y ES, en claro y oscuro, en móvil y desktop.
- [ ] `content.ts` ya no es la fuente de categorías ni platillos.
- [ ] Build y lint limpios.

## Lo que NO debes hacer en este encargo

- Nada de pedidos, carrito, Stripe, reservaciones, promociones, mesas/QR,
  testimonios ni dashboard de métricas. Sus entradas del menú van visibles y
  deshabilitadas.
- No toques el diseño del landing salvo el arreglo de contraste de bordes de la
  Fase 1 y el cambio de fuente de datos del menú de la Fase 6.
- No cambies `prisma/schema.prisma`. Si de verdad hace falta un campo, **para y
  pregúntame** — el esquema está documentado en `docs/DATABASE.md` y cada
  decisión tiene una razón escrita.
- No refactorices `components/marea-landing/` "de paso".

## Cómo trabajar

Ejecuta esto con el skill **`build-loop-claude-code`**: construye por fases,
corre `/review` (y `/security-review` en la fase de autenticación) al terminar
cada una, arregla todo lo que salga, verifica la fase de punta a punta en el
navegador antes de seguir.

**Para al final de la Fase 1 y espera mi aprobación del diseño.** Después de
eso, avanza de corrido y repórtame al terminar cada fase.
