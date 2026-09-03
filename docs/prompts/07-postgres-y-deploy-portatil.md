# Prompt para Claude Code — Módulo 7: Postgres a secas y despliegue portátil

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code` y **para al final de la Fase 1** a esperar respuesta
> a las decisiones de despliegue.

---

Seis módulos y el sistema está mejor construido de lo que aparenta: la
`EXCLUDE` constraint de reservaciones, los `FOR UPDATE` en todo lo que mueve
dinero, los precios congelados, la idempotencia del webhook de Stripe. Nada de
eso se toca aquí.

Lo que sí se toca es dónde puede vivir. Hoy el proyecto asume dos proveedores
que nadie eligió a conciencia: **Supabase** (dos URLs de base de datos, un
Storage que ni siquiera está encendido, y once comentarios que lo dan por
sentado) y **Vercel** (la lectura de `x-forwarded-for`, el corte de 75 segundos
del SSE, y el origen de las URL de los QR impresos prestado de `AUTH_URL`).
Ninguno de los dos aporta algo que Postgres y un contenedor no den, y los dos
son decisiones que hay que tomar **antes** de que se decida el hosting, no
después.

Las buenas noticias: el anclaje es pequeño. Nueve de las once menciones de
Supabase son comentarios. `btree_gist` y la `EXCLUDE` constraint son Postgres
estándar y corren igual en un `postgres:17-alpine`. El único acoplamiento
funcional real es el almacenamiento de imágenes, que hoy está apagado.

Este módulo termina cuando `docker compose up` levanta el sistema completo en
una máquina limpia, sin cuenta en ningún proveedor, y el mismo artefacto corre
en un VPS, en Railway, en Fly o en Vercel sin cambiar una línea.

**Cero cambios de esquema.** Si algo te empuja a una migración, para y dime:
significa que el módulo se salió de su alcance.

Lee antes de empezar, en este orden: **`docs/CONVENCIONES.md`** (git, commits,
pull request, comentarios y documentación — es normativo y este prompt no
repite sus reglas), `docs/PLAN-PRODUCCION.md` (fase 0, de donde sale este
prompt), `docs/DATABASE.md` §4 y `README.md`.

Y ojo: **cinco de los seis prompts anteriores** (01, 02, 03, 04 y 06) abren con
"lee `AGENTS.md`" y **ese archivo no existe** — nunca se creó, ni está en el
historial de git. La Fase 5 lo arregla.

---

## Cómo trabajar

`docs/CONVENCIONES.md` manda. Aquí sólo va lo que es propio de este módulo y las
dos comprobaciones que **bloquean el arranque**.

**Antes de crear la rama, las dos comprobaciones. Si alguna falla, para y dime.**

```bash
gh pr list --state open                                        # tiene que estar vacío
git switch main && git pull
git log --oneline main..feature/tables-and-settings | wc -l    # tiene que dar 0
```

Un pull request abierto significa que hay trabajo en revisión: no se empieza
encima de una base que todavía puede cambiar. Y si el conteo no da 0, el módulo
6 no está fusionado y este módulo tocaría archivos que aún no existen en `main`.

Con las dos en verde:

```bash
git switch -c feature/portable-deploy
git fetch --prune
git branch --merged main | grep -v '^\*\| main$' | xargs -r git branch -d
git config core.hooksPath .githooks   # activa la validación de mensajes
```

**Commits.** Formato semántico, máximo 50 caracteres, imperativo presente, sin
punto final, un commit por función o pantalla. La sección 3 de
`docs/CONVENCIONES.md` tiene el formato completo, los tipos y los ejemplos; el
hook `commit-msg` rechaza lo que no cumpla. Para este módulo los tipos que vas a
usar casi siempre son `build` (Dockerfile, empaquetado), `chore` (variables,
limpieza), `feat(storage)`, `fix` (los hallazgos de la Fase 0) y `docs`.

Ejemplos de los que salen de aquí:

```
fix(auth): trust proxy count for client ip
feat(storage): add s3 driver
build(deploy): add multi-stage dockerfile
chore: drop supabase env vars
docs(deploy): add deployment guide
```

**Al terminar el módulo se abre el pull request a `main` y se para ahí.** No se
fusiona.

**Una regla extra, propia de este módulo:** cada fase debe dejar el sistema
arrancando. No hay "lo arreglo en el siguiente commit" cuando lo que estás
tocando es la conexión a la base de datos, y el criterio de reversibilidad de la
sección 4 de las convenciones se vuelve literal: cualquiera de estos commits
puede necesitar un `git revert` a las once de la noche.

---

## Fase 0 — Los siete hallazgos de la auditoría que caen aquí

No son de reservaciones ni del panel: son los sitios donde el código asume un
proveedor. Cada uno su commit. Los tres primeros son los que importan.

**0.1 — `getClientIp` sólo funciona detrás de Vercel.**
`lib/auth/rate-limit.ts` toma el **primer** valor de `x-forwarded-for`. Eso es
correcto sólo si el proxy de enfrente *reescribe* la cabecera, que es lo que
hace Vercel. Detrás de un nginx que la reenvía tal cual —o sin proxy— cualquiera
manda la suya y **evade todos los límites por IP**, incluido el de creación de
reservaciones que el módulo 4 se tomó el trabajo de construir. El propio
comentario del archivo lo admite y no lo mitiga.

Resuélvelo por número de proxies de confianza, no por posición fija: una
variable `TRUSTED_PROXY_COUNT` (por defecto 1) y la IP real es la N-ésima
**desde el final** de la cadena, porque todo lo que el cliente pudo inyectar
queda a la izquierda. El límite por email no depende de esto y sigue siendo la
defensa principal; dilo en el comentario que sustituya al actual.

Y **escribe el test**: una petición con un `x-forwarded-for` falsificado tiene
que toparse igual con el límite. Sin ese test el arreglo es una intención.

**0.2 — El origen de los QR impresos está prestado de otra variable.**
`appOrigin()` en `app/admin/(shell)/mesas/imprimir/page.tsx` reutiliza
`AUTH_URL` con el argumento —razonable— de que es el origen que Auth.js ya
considera canónico. El problema no es el préstamo, es la consecuencia: si
`AUTH_URL` no está definida, el fallback silencioso es `http://localhost:3000`
y eso se **imprime en papel y se pega en cincuenta mesas**. Es el único error de
configuración de este proyecto que cuesta dinero físico.

`APP_ORIGIN` propia, con `AUTH_URL` de respaldo, y **sin fallback a localhost en
producción**: si ninguna está definida y `NODE_ENV === "production"`, la
aplicación no arranca. Ver 0.4.

**0.3 — El SSE se corta cada 75 segundos por una razón que quizá ya no aplica.**
`MAX_LIFETIME_MS` en `app/api/orders/stream/route.ts` existe porque en Vercel
cada conexión abierta es una invocación facturada de forma continua. En un
proceso largo eso no aplica: cortar cada 75 s sigue siendo inofensivo (el
cliente reconecta solo y el evento `reconnect` ya evita que parpadee a
"offline"), pero es una decisión de hosting incrustada en el código.

Hazlo `SSE_MAX_LIFETIME_MS`, con 75000 por defecto y `0` = sin corte. Reescribe
el comentario para que explique el mecanismo, no la factura de un proveedor. **No
toques el polling** — sustituirlo por `LISTEN/NOTIFY` es el módulo 15 y meterlo
aquí es la forma más rápida de que este módulo no termine nunca.

**0.4 — La configuración se descubre en producción, no al arrancar.**
Hoy la única variable que se comprueba es `DATABASE_URL`, y se comprueba **la
primera vez que alguien usa Prisma**. Un despliegue mal configurado arranca
"bien", pasa el health check si lo hubiera, y falla en la primera visita de un
cliente real.

Un módulo `lib/env.ts` con un esquema de Zod que se evalúa **una sola vez, al
importar**, y que rompe el arranque con un mensaje que diga qué falta y con qué
forma. Distingue lo obligatorio siempre (`DATABASE_URL`, `AUTH_SECRET`) de lo
obligatorio sólo en producción (`APP_ORIGIN`, y las credenciales del storage si
el driver es `s3`). Todo el código pasa a leer de ahí; `process.env` deja de
aparecer disperso.

Ojo con dos cosas: las variables `NEXT_PUBLIC_*` se inlinean en build y no se
pueden validar igual, y este módulo **no puede importarse desde un Client
Component** — márcalo con `server-only` salvo la parte pública, que va aparte.

**0.5 — El seed puede correr contra producción.**
`prisma/seed.ts` crea tres cuentas cuyas contraseñas están **publicadas en el
README**. Un `npm run db:seed` con el `.env` equivocado —que es exactamente el
tipo de error que se comete el día del primer despliegue— regala acceso de
`SUPER_ADMIN`. Que el seed se niegue a correr si `NODE_ENV` es `production` o si
`DATABASE_URL` no apunta a un host local, salvo con una variable explícita de
escape que haya que teclear a propósito.

**0.6 — El manifiesto no sabe si es una app o una librería.**
`package.json` declara `main`, `module`, `types`, `exports` y un `build:lib` con
tsup, y a la vez es la aplicación Next. Dos identidades en el mismo paquete y el
mismo `node_modules`. Es lo primero que confunde a quien recibe el proyecto, y
en este módulo importa de verdad porque el `Dockerfile` tiene que decidir qué
está empaquetando.

**Decide y dime cuál de las dos**: la librería se va a `packages/ui/` con su
propio manifiesto (y el repo pasa a workspaces), o esos cinco campos y los dos
scripts se borran. No lo hagas sin decírmelo: si la librería sigue publicándose
a Claude Design, la respuesta puede ser la primera y es más trabajo.

Añade también `"engines": { "node": ">=22" }`. El build ya lo asume.

**0.7 — `imageUrl` acepta cualquier cosa que parezca una URL.**
`buildMenuItemSchema` valida con `z.string().url()`, que deja pasar
`javascript:` y `http:`. Es inerte dentro de un `<img src>` —no es un XSS— pero
permite contenido mixto y que un tercero rastree a quien abre el panel. Como la
Fase 3 va a reescribir todo lo que rodea a ese campo, arréglalo aquí: sólo
`https`, y sólo hosts de una lista (el propio y el del storage).

---

## Fase 1 — Decisiones de despliegue (para y espera respuesta)

Este módulo no tiene pantallas nuevas que diseñar, pero sí cuatro decisiones que
no debes tomar solo porque condicionan todo lo demás. Investígalas, propón con tu
razón, y **para aquí**.

**(a) Driver de almacenamiento por defecto.** `local` (disco montado como volumen,
servido por un route handler) es más simple y suficiente para un restaurante en
un solo servidor; `s3` (contra MinIO, R2, B2, Hetzner, AWS…) es lo que hace falta
en cuanto haya más de una réplica, porque un volumen local no se comparte.
Mi inclinación es `local` por defecto y `s3` disponible desde el día uno, pero
dime si ves algo que lo desmienta.

**(b) Cómo se sirven las imágenes en modo `local`.** Route handler bajo
`/api/media/...` es lo obvio y pasa por Node en cada petición. Servirlas como
estáticos desde el reverse proxy es más rápido y saca a Next del camino, pero
ata el despliegue a que exista ese proxy. Enséñame el `Cache-Control` que
propones en cada caso.

**(c) Forma del despliegue de referencia.** Voy a documentar **uno** como
recomendado y el resto como posibles. Propón: Docker Compose en un VPS,
plataforma tipo Railway/Render/Fly, o Kubernetes. Quiero tu recomendación para
*un restaurante*, no para una startup — con su costo mensual aproximado y qué se
rompe primero en cada opción.

**(d) La pregunta de 0.6**, la de la identidad del paquete.

Cuando respondas eso último, dime también **qué versión de Postgres** vas a fijar
en el Compose y por qué, y confirma que `btree_gist` está disponible en esa
imagen — porque si no lo está, las reservaciones dejan de tener su garantía y
eso es un bloqueo, no un detalle.

---

## Fase 2 — Postgres a secas

**Una sola URL.** `DIRECT_URL` existe únicamente porque el pooler de Supabase en
modo transacción no soporta los prepared statements de `prisma migrate`. Con
Postgres directo no hace falta: que `prisma.config.ts` use
`DIRECT_URL ?? DATABASE_URL` y que `.env.example` la documente como **opcional,
sólo si algún día metes un pooler en modo transacción delante de la app**.

**El pool, explícito.** Fuera de serverless la aplicación es un proceso largo con
su propio pool y hoy nadie lo configura. Pásale `max`, `idleTimeoutMillis` y
`connectionTimeoutMillis` a `PrismaPg`, con `max` desde
`DATABASE_POOL_MAX` (25 por defecto). Escribe la fórmula en el comentario:
`(max_connections − reservadas) / (réplicas + workers)`. Alguien va a tener que
subir ese número y necesita saber contra qué.

**Los mensajes de error.** El `throw` actual dice *"usa la URL del pooler de
Supabase, puerto 6543"*, que a partir de este módulo es una instrucción
equivocada. Que diga el formato que sí sirve.

**Los comentarios que mienten.** Nueve sitios. Tres los arreglas aquí y son los
que están en código vivo:

- `lib/prisma.ts` — cabecera entera.
- `prisma/schema.prisma:62`, el bloque `datasource`.
- `prisma/schema.prisma:1367`, el bloque de IA comentado: `CREATE EXTENSION
  vector` es de **pgvector**, no de Supabase. Corrige la atribución, no el
  contenido.

`prisma/schema.prisma:939` (el comentario de `OrderStatusEvent` que dice que
Supabase Realtime escucha sus INSERTs) y los de
`app/api/orders/stream/route.ts` se reescriben en el módulo 15, cuando el
mecanismo cambie de verdad. **Déjalos**: cambiarlos ahora sería documentar algo
que todavía no es cierto.

**Verifica que nada se rompió** con lo que de verdad importa: levanta un
`postgres:17` limpio, corre `prisma migrate deploy`, siembra, y **comprueba a
mano que dos reservaciones solapadas sobre la misma mesa siguen chocando contra
`reservation_no_overlap`**. Esa constraint es la garantía más valiosa del
sistema y este es el módulo que más fácil podría romperla sin que nadie se
entere.

---

## Fase 3 — Almacenamiento de imágenes, con driver

Es el único acoplamiento funcional. Hoy `lib/storage/config.ts` sólo comprueba
dos variables de Supabase y, si faltan, `ImageField.tsx` pinta un dropzone
deshabilitado y deja el campo de URL como única vía real. El módulo 1 lo dejó
así a propósito y lo documentó; toca cerrarlo.

**La interfaz primero.** `lib/storage/driver.ts` con `put`, `delete` y
`publicUrl`. Dos implementaciones: `local` (disco) y `s3`
(`@aws-sdk/client-s3` apuntando a `S3_ENDPOINT`, que es lo que la vuelve
portátil: MinIO, R2, B2, Hetzner o AWS con la misma línea de código).
`lib/storage/index.ts` resuelve el driver una vez y **falla al arrancar** si la
configuración está incompleta, nunca a mitad de una subida.

**La subida, en orden y sin saltarse pasos.** Server Action, y cada paso está
por una razón:

1. `requireRole(...ADMIN_ROLES)` en la primera línea, como todo lo demás.
2. Tamaño ≤ 5 MB.
3. Tipo **por contenido**, leyendo los primeros bytes. No por la extensión ni
   por el `Content-Type` que manda el cliente, que son campos que el cliente
   controla. Sólo JPEG, PNG y WebP.
4. **Reprocesar con `sharp`**: máximo 1600 px de lado largo, a WebP, calidad 82.
   Esto no es sólo optimización: normaliza el peso, **borra los metadatos EXIF**
   —que traen la geolocalización del teléfono con que se fotografió el
   platillo— y neutraliza cualquier payload escondido en el archivo original.
5. Clave determinista `menu-items/<cuid2>.webp`. Nunca el nombre que llegó del
   cliente.

**El borrado tiene una trampa.** Cuando un platillo cambia de imagen hay que
soltar la vieja, pero si lo haces en línea y la transacción falla te quedas sin
imagen y con la fila apuntando a un 404. Piénsalo y **dime tu solución** antes de
escribirla: encolarlo, un barrido posterior de huérfanos, o aceptar la fuga y
documentarla. Cualquiera de las tres es defendible; la que no vale es borrar
optimistamente.

**`ImageField.tsx`** deja de consultar `isStorageConfigured()` y pasa a ser un
dropzone real: `useActionState`, vista previa, estado de carga, error legible. El
campo de URL se queda como alternativa para imágenes ya alojadas en otro lado —
no lo quites, es la vía de escape cuando el storage falla.

`lib/storage/config.ts` desaparece, y con él su comentario.

---

## Fase 4 — Empaquetado y despliegue

**`output: "standalone"`** en `next.config.mjs`. Es lo que hace que la imagen
pese ~150 MB en vez de más de un giga, y lo que permite que el mismo artefacto
corra en cualquier host con Node. Añade también `images.remotePatterns` con el
host del storage y **sólo** ese: nada de `**`.

**`Dockerfile` multi-etapa**, usuario sin privilegios, `node:22-alpine`. Tres
cosas que se te van a olvidar y cuestan una tarde cada una:

- `sharp` en Alpine necesita `libc6-compat`, y el error que da si falta no dice
  eso.
- `prisma/schema.prisma` y el CLI de Prisma **no** entran en el bundle de
  `standalone`: cópialos explícitamente o no puedes migrar desde el contenedor.
- `next/font` sí se incluye; no vayas a copiar `node_modules` entero "por si
  acaso" y tirar a la basura la razón de usar `standalone`.

**`docker-compose.yml`** con `db` (con `healthcheck` de `pg_isready`), un
servicio `migrate` de un solo uso que corre `prisma migrate deploy`, y `app`
dependiendo de los dos. Volúmenes nombrados para los datos y para el media.
Deja comentado el servicio `worker`: llega en el módulo 10 y quiero que se vea
el hueco.

**El seed nunca corre solo.** Ni en Compose ni en ninguna plataforma. Es un
comando que alguien teclea, y a partir de 0.5 se niega a correr contra
producción.

**`/api/health`**, sin autenticación, con un `SELECT 1` de verdad. Que responda
**503 si la base no contesta**, no 200 con un campo en falso — lo va a consumir
un balanceador que sólo mira el código de estado. Devuelve algo mínimo:
`{ ok, db, version }`. Nada de contar filas ni de exponer la versión de Postgres.

**`.dockerignore`** con al menos: `node_modules`, `.next`, `.git`, `dist`,
`ds-bundle`, `graphify-out`, `.agents`, `.claude`, `.design-sync`, `.ds-sync`,
`*.tsbuildinfo`, `.env*`. Ese último renglón no es opcional.

**Pruébalo de verdad**, no "debería funcionar": borra los volúmenes, `docker
compose up --build` desde cero, y anota cuánto tarda hasta que la landing
responde. Ese número va en el README.

---

## Fase 5 — Documentación y limpieza

**`docs/DEPLOY.md`**, nuevo. La opción recomendada que salga de la Fase 1(c),
paso a paso y reproducible, más un apartado de "otras opciones" con lo que
cambia en cada una. Incluye la configuración de nginx que hace cierto lo que
0.1 asume (`set_real_ip_from`, `real_ip_header`): sin ella el arreglo del rate
limit es teoría.

**`AGENTS.md`**, nuevo — y esto lleva pendiente desde el módulo 1, que ya lo
citaba como si existiera. Corto y operativo, no un ensayo: Next 16 llama
`proxy.ts` al middleware; ningún token público de capacidad usa `cuid()` (la
regla que el módulo 6 dejó escrita en el esquema); ninguna fecha se interpreta
en el cliente; `Prisma.Decimal` no cruza a un Client Component; `requireRole()`
en la primera línea de cada mutación; cómo se levanta el entorno; qué comandos
existen. Que quepa en una pantalla y media.

**No copies ahí las convenciones de git.** `AGENTS.md` enlaza a
`docs/CONVENCIONES.md` y punto: dos documentos con las mismas reglas se
desincronizan al segundo cambio.

**`README.md`.** La sección de base de datos deja de hablar de Supabase, la de
despliegue deja de decir "construido para Vercel" y apunta a `docs/DEPLOY.md`, y
las credenciales sembradas ganan una línea sobre el candado de 0.5.

**`docs/DATABASE.md` §4.** "Detalles de Supabase que muerden" pasa a ser "Puesta
en marcha con Postgres". El párrafo de RLS **se conserva**, reencuadrado: RLS es
de Postgres desde la 9.5, no de Supabase, y es el plan del módulo 16. Ese matiz
importa porque hoy el documento hace pensar que perderías RLS al salir de
Supabase, y es al revés.

**`docs/prompts/01`, `02` y `03` no se editan.** Son el registro de lo que se
pidió en su momento y reescribirlos borra el historial de decisiones. Añade a
cada uno, arriba, una línea de errata que nombre lo que de verdad quedó sin
efecto en ese documento — no la misma frase copiada tres veces:

| Documento | Qué quedó sin efecto |
|---|---|
| `01-panel-admin-menu.md` | La subida de imágenes a Supabase Storage (Fase 3 de este módulo) |
| `02-circuito-del-pedido.md` | El descarte de Supabase Realtime y el razonamiento de facturación de Vercel |
| `03-cobros-y-stripe.md` | El tope de vida del SSE justificado por la facturación de Vercel |

Con esta forma:

```
> Errata (módulo 7): <lo que quedó sin efecto>.
> Ver docs/PLAN-PRODUCCION.md y docs/prompts/07-postgres-y-deploy-portatil.md.
```

**`.env.example`** se reescribe entero, agrupado por bloques y con un comentario
por variable diciendo qué pasa si falta. Es el archivo que va a leer quien
despliegue esto sin haber escrito una línea del código.

**Limpieza del árbol:** borra del disco `dist/`, `ds-bundle/` y `graphify-out/`.
Están en `.gitignore` pero ocupan sitio y confunden a quien clona.

**Los dos emojis que quedan en el repo**, por la sección 8 de las convenciones:
uno en `docs/DATABASE.md` línea 466, dentro de un comentario de ejemplo, y trece
marcas de check y cruz en `docs/design.md` que separan lo correcto de lo
incorrecto. Sustitúyelas por texto ("correcto" / "incorrecto", o `[x]` / `[ ]`)
sin tocar el contenido. Commit aparte, `style(docs)`.

---

## Fase 6 — Cierre

**1. El grafo.**

```bash
graphify
node scripts/graphify-to-obsidian.mjs --out "<vault>/04-Proyectos-Verticales/Marea-Codigo"
```

Si el módulo 8 ya corrió, el generador limpia solo lo que dejó de producir. Si
no, este módulo mueve archivos de sitio y la corrida va a dejar notas huérfanas
en el vault: cuenta los `.md` de `Marea-Codigo/` contra los módulos del mapa más
dos, y borra a mano lo que sobre. No lo arregles aquí, es el módulo 8.

Revisa el grado de `lib/env.ts` y de `lib/storage/index.ts`: son símbolos nuevos
y muy conectados. Si `process.env` sigue apareciendo disperso fuera de
`lib/env.ts`, ahí se ve. Y mira "conexiones que cruzan módulos": este módulo
debería haber **reducido** aristas, no añadido. Si añadió, dime cuáles y por qué.

**2. Las notas de Obsidian.** Dos escrituras, según la sección 9 de las
convenciones:

- La **nota funcional** en
  `04-Proyectos-Verticales/Marea-Bitacora/07-Postgres-y-despliegue-portatil.md`,
  con la plantilla de `Marea-Bitacora/00-Indice.md`. Para este módulo, como
  mínimo: las cuatro decisiones de la Fase 1 con su alternativa descartada, el
  procedimiento de despliegue en cinco líneas, la tabla de variables nuevas y
  eliminadas, y los límites que quedan (el tiempo real sigue siendo polling, no
  hay CI todavía, no hay cabeceras de seguridad). Actualiza también la tabla de
  módulos del índice.
- **La nota de producto**, `04-Proyectos-Verticales/Grupo-1-Comida-Bebida.md`.
  Su checklist "Debe incluir" alimenta `Pendientes.md`, y hoy está desfasada:
  marca Stripe y reservaciones como pendientes cuando las dos están
  construidas, y no menciona mesas y QR ni configuración del negocio. Ponla al
  día con lo que de verdad existe al cerrar este módulo.

No escribas notas funcionales dentro de `Marea-Codigo/`: se sobrescribe entera
en cada corrida salvo lo que quede entre `notas:inicio` y `notas:fin`.

**3. La verificación de autoría**, antes de abrir el pull request:

```bash
git log main..HEAD --pretty="%an|%cn|%s|%b" \
  | grep -Ei "claude|copilot|chatgpt|co-authored|generated with|assisted"
```

Tiene que devolver vacío.

**4. El pull request.** `gh pr create --base main`, con la plantilla de
`.github/pull_request_template.md`. Marca la casilla "cambia configuración de
despliegue o variables de entorno", que es exactamente lo que hace este módulo.
Descripción concisa: qué se desancló, qué se decidió en la Fase 1, qué quedó
fuera. **No lo fusiones.**

---

## Reglas técnicas

Las de siempre: Server Components por defecto · mutaciones con Server Actions
validadas con Zod · `Prisma.Decimal` nunca cruza a un Client Component ·
`deletedAt: null` en todo query de catálogo · `businessId` siempre desde
`getCurrentBusiness()` · `requireRole()` en la primera línea de cada mutación ·
todo lo que toque estado va en transacción · el servidor no confía en el cliente
· sin librerías de UI nuevas · accesible con teclado y AA · build y lint
limpios, sin `any` ni `@ts-ignore`.

Tres del módulo:

- **Ningún proveedor entra al código sin una interfaz y dos implementaciones.**
  Es la regla que este módulo deja escrita, no sólo aplicada. Si mañana hace
  falta un proveedor de correo, de SMS o de facturación, se entra por aquí.
- **Ninguna variable de entorno se lee fuera de `lib/env.ts`.** Y ninguna
  configuración se descubre en producción: o el proceso arranca bien
  configurado, o no arranca.
- **Nada de lo que ya funciona cambia de comportamiento.** Este módulo mueve
  dónde vive el sistema, no qué hace. Si un test existente cambia de resultado,
  algo salió mal.

Dependencias nuevas autorizadas, **sólo estas dos**: `sharp` y
`@aws-sdk/client-s3`. Cualquier otra, para y pregunta.

---

## Definición de terminado

- [ ] La rama salió de un `main` con `feature/tables-and-settings` ya fusionada.
- [ ] `npm test` pasa en Windows y me pegaste la salida.
- [ ] `docker compose up --build` en una máquina limpia levanta base y
      aplicación, aplica migraciones y la landing responde. Me dices cuánto tardó.
- [ ] Dos reservaciones solapadas sobre la misma mesa siguen chocando contra
      `reservation_no_overlap` en el Postgres del contenedor.
- [ ] `grep -ri supabase app/ lib/ components/ prisma/schema.prisma` devuelve
      cero, salvo el comentario de `OrderStatusEvent` y los del stream, que son
      del módulo 15.
- [ ] `grep -ri vercel app/ lib/ components/` devuelve cero.
- [ ] Subo una foto de platillo con `STORAGE_DRIVER=local` y con
      `STORAGE_DRIVER=s3` contra un MinIO local. Las dos funcionan.
- [ ] La imagen resultante es WebP, sin EXIF, con nombre generado, y la original
      con metadatos no quedó en ningún lado.
- [ ] Arranco sin `AUTH_SECRET` y el proceso **no** arranca, con un mensaje que
      dice qué falta.
- [ ] Arranco en producción sin `APP_ORIGIN` ni `AUTH_URL` y el proceso no
      arranca. Ningún QR puede salir apuntando a localhost.
- [ ] `npm run db:seed` se niega a correr contra una `DATABASE_URL` que no sea
      local.
- [ ] `/api/health` devuelve 200 con la base arriba y **503** con la base caída
      (apaga el contenedor de Postgres y enséñame la salida).
- [ ] Una petición con `x-forwarded-for` falsificado se topa igual con el límite
      de tasa, y hay un test que lo demuestra.
- [ ] `docs/DEPLOY.md` y `AGENTS.md` existen y alguien que no escribió el código
      puede seguirlos.
- [ ] `.env.example` documenta todas las variables y ninguna sobra.
- [ ] `git config core.hooksPath` es `.githooks` y el hook rechaza un mensaje
      mal formado (pruébalo a propósito y enséñame la salida).
- [ ] Todos los commits del módulo llevan prefijo semántico, ninguno pasa de 50
      caracteres y ninguno lleva punto final.
- [ ] Cada commit es revertible por sí solo: elige uno intermedio, haz
      `git revert --no-commit`, comprueba que el sistema queda coherente, y
      deshaz la prueba.
- [ ] `git log main..HEAD` con el grep de autoría devuelve vacío.
- [ ] No hay un solo emoji en el código, los commits, la documentación ni las
      notas del vault.
- [ ] La nota funcional del módulo existe en `Marea-Bitacora/`, el índice de esa
      carpeta la lista, y la checklist de `Grupo-1-Comida-Bebida.md` refleja lo
      que de verdad está construido.
- [ ] Tras la corrida del generador, `Marea-Codigo/` no tiene notas huérfanas:
      el número de archivos coincide con los módulos del mapa más dos.
- [ ] El pull request está abierto contra `main`, con la plantilla llena, y
      **sin fusionar**.

---

## Lo que NO debes hacer

- **Ninguna migración de esquema.** Cero. Si crees que hace falta una, para y
  dime.
- **No sustituyas el polling del SSE por `LISTEN/NOTIFY`.** Es el módulo 15.
  Aquí sólo se vuelve configurable el tiempo de vida.
- **No montes el CI.** Es el módulo 8, el siguiente. Lo único que este módulo
  debe dejar listo es que el entorno sea reproducible, que es su requisito.
- **No metas cabeceras de seguridad ni CSP, ni límites de tasa en las acciones
  públicas de pedido.** Es el módulo 9. La excepción es 0.1, que es un bug de
  portabilidad, no una mejora de seguridad.
- **No construyas el worker de notificaciones.** Módulo 10. Aquí sólo se deja
  comentado su hueco en el Compose.
- **No toques la lógica de pedidos, pagos, reservaciones ni el panel**, más allá
  de `ImageField` y de lo que 0.1–0.7 nombran explícitamente.
- **No cambies de versión mayor** de Next, Prisma, React ni Auth.js. Auth.js
  sigue en beta y ese riesgo se administra en su propio momento, no de pasada.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase y
`/security-review` en la Fase 0 y en la Fase 3 — la primera toca el límite de
tasa y el candado del seed, la segunda acepta archivos subidos por un usuario,
que es la superficie más peligrosa que este proyecto ha tenido hasta ahora.

**Para al final de la Fase 1** y espera respuesta a las cuatro decisiones;
después avanza de corrido, subiendo la rama y reportando al cerrar cada fase.

Y una advertencia que vale para todo el módulo: estás tocando la conexión a la
base de datos, el empaquetado y la configuración — las tres cosas que, cuando
fallan, fallan **en el despliegue y no en tu máquina**. Prueba cada fase contra
el contenedor, no contra tu `npm run dev`.
