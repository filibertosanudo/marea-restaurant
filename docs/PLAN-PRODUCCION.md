# Marea — Plan de producción v2

> Continuación del roadmap del `README.md` y respuesta directa a la auditoría
> técnica del 2 de septiembre de 2026 (HEAD `017d798`). Este documento es el
> plan maestro: define **fases**, **orden**, **criterios de terminado** y las
> decisiones de arquitectura que dejan de estar amarradas a Supabase y a Vercel.
>
> Documentos hermanos: `docs/CONVENCIONES.md` (cómo se trabaja: git, commits,
> pull request, comentarios, documentación), `docs/DATABASE.md` (razón del
> esquema), `docs/product/roles-y-alcance.md` (matriz de permisos),
> `docs/design.md` (tokens). Los `docs/prompts/01..06` son el **registro
> histórico** de lo ya construido: no se editan, se continúan a partir del `07`.

---

## Contenido

- [Cómo se usa este documento](#cómo-se-usa-este-documento)
- [Principios que rigen todo el plan](#principios-que-rigen-todo-el-plan)
- [Mapa de fases](#mapa-de-fases)
- **[Fase 0 — Desanclaje: Postgres puro y deploy portátil](#fase-0--desanclaje-postgres-puro-y-deploy-portátil)** · 30–45 h
  - 0.1 Colapsar la configuración de base de datos · 0.2 Almacenamiento sin Supabase Storage
  - 0.3 Docker y `output: "standalone"` · 0.4 Quitar los supuestos de Vercel
  - 0.5 Limpiar el rastro de Supabase · 0.6 Higiene del paquete
- **[Fase 1 — Red de seguridad: CI y pruebas](#fase-1--red-de-seguridad-integración-continua-y-pruebas)** · 50–70 h
- **[Fase 2 — Endurecimiento de seguridad](#fase-2--endurecimiento-de-seguridad)** · 35–50 h
- **[Fase 3 — Notificaciones reales](#fase-3--notificaciones-reales)** · 40–55 h
- **[Fase 4 — Operación diaria: reportes, corte de caja y comanda](#fase-4--operación-diaria-reportes-corte-de-caja-y-comanda)** · 70–95 h
- **[Fase 5 — Completar el catálogo](#fase-5--completar-el-catálogo)** · 60–80 h
- **[Fase 6 — Rendimiento y tiempo real de verdad](#fase-6--rendimiento-y-tiempo-real-de-verdad)** · 50–70 h
- **[Fase 7 — Multi-sucursal y multi-tenant](#fase-7--multi-sucursal-y-multi-tenant)** · 70–110 h
- **[Fase 8 — De sistema a producto vendible](#fase-8--de-sistema-a-producto-vendible)** · 90–140 h
- Apéndices: [A · variables de entorno](#apéndice-a--variables-de-entorno-antes-y-después) ·
  [B · migraciones](#apéndice-b--migraciones-de-esquema-que-introduce-el-plan) ·
  [C · dependencias](#apéndice-c--dependencias-nuevas-y-qué-justifica-cada-una) ·
  [D · puerta de salida](#apéndice-d--puerta-de-salida-a-producción) ·
  [E · anti-objetivos](#apéndice-e--anti-objetivos) ·
  [F · fase → prompt](#apéndice-f--de-fase-a-prompt-de-módulo)

**Si sólo lees una sección:** la 0 (desanclaje) y la 1 (pruebas). Todo lo demás
depende de esas dos.

---
## Cómo se usa este documento

Cada fase de este plan se convierte, cuando llega su turno, en un prompt propio
bajo `docs/prompts/NN-nombre.md`, con la misma estructura que los seis
anteriores: Fase 0 de hallazgos pendientes, fases numeradas, un commit por
preocupación, rama `feature/<nombre>` partida de un `main` ya actualizado.

Cómo se trabaja —ramas, commits, pull request, comentarios, documentación—
está en **`docs/CONVENCIONES.md`**, que es normativo y al que todos los prompts
remiten en lugar de repetirlo.

El mapeo fase → prompt está en el **Apéndice F**. Este archivo es la fuente de
verdad del *qué* y del *por qué*; el prompt de cada módulo es el *cómo* con
detalle de implementación.

**Regla de oro del plan:** ninguna fase se da por cerrada sin que su checklist de
"terminado" pase entera. Media fase terminada es deuda disfrazada de progreso, y
este proyecto ya demostró que no la necesita.

---

## Principios que rigen todo el plan

**1. Portabilidad antes que comodidad.**
No hay ninguna razón técnica para que este sistema dependa de Supabase o de
Vercel. Usa **PostgreSQL a secas** y **cualquier host que corra Node 22**. Toda
decisión que ate el código a un proveedor concreto se resuelve detrás de una
interfaz con al menos dos implementaciones, una de las cuales corre en tu
laptop sin cuenta en ningún lado.

**2. Primero la red, después el trapecio.**
Nada de funcionalidad nueva hasta que exista CI y pruebas sobre las rutas de
dinero. El código actual es bueno *hoy*; sin pruebas, la tercera persona que lo
toque (o tú dentro de cuatro meses) lo degrada sin enterarse.

**3. Una dependencia nueva sólo si se gana el sitio.**
Criterio: sustituye a más de ~100 líneas propias, o cierra un riesgo que no
sabes cerrar bien a mano (criptografía, parsers, protocolos). El proyecto lleva
19 dependencias de producción; ese número es una virtud, no una casualidad.

**4. Cada fase termina en un estado desplegable.**
Al final de cada fase el sistema arranca, pasa CI y se puede poner frente a un
restaurante real. No hay fases que sólo "preparan" para la siguiente.

**5. La regla del dinero.**
Cualquier cambio que toque `Order`, `Payment`, `Refund`, `Promotion` o el
inventario **no se mergea sin test de integración**. Sin excepciones, sin "es
que es trivial".

**6. El esquema es patrimonio, no borrador.**
`prisma/schema.prisma` es la mejor pieza del proyecto. Este plan lo **extiende**
—cinco tablas nuevas en total— y no reescribe nada de lo existente. Si una fase
te empuja a rediseñar el esquema, la fase está mal planteada.

**7. Las convenciones viven en un solo documento.**
`docs/CONVENCIONES.md` es normativo desde el módulo 7: ramas, formato semántico
de commits (máximo 50 caracteres, imperativo presente, sin punto final), un
commit por función o pantalla con criterio de reversibilidad, pull request a
`main` al cerrar cada módulo sin fusionar, autoría exclusiva de Filiberto sin
trailers de coautoría, comentarios cortos, cero emojis y documentación funcional
en Obsidian. Ningún prompt de módulo repite esas reglas: las enlaza.

---

## Mapa de fases

| # | Fase | Qué desbloquea | Esfuerzo |
|---|---|---|---|
| **0** | Desanclaje: Postgres puro y deploy portátil | Poder desplegar donde sea, sin cuenta en Supabase | 30–45 h |
| **1** | Red de seguridad: CI y pruebas | Tocar el sistema sin miedo | 50–70 h |
| **2** | Endurecimiento de seguridad | Poder exponerlo a internet con la conciencia tranquila | 35–50 h |
| **3** | Notificaciones reales | Que el cliente reciba su confirmación. Bloqueador de venta #1 | 40–55 h |
| **4** | Operación diaria: reportes, corte de caja, comanda | Que el dueño perciba el valor todos los días | 70–95 h |
| **5** | Completar catálogo: inventario, promociones, testimonios | Cerrar el alcance que la base ya soporta | 60–80 h |
| **6** | Rendimiento y tiempo real de verdad | Aguantar el servicio de un viernes | 50–70 h |
| **7** | Multi-sucursal y multi-tenant | Vender al segundo cliente sin desplegar otra vez | 70–110 h |
| **8** | Producto vendible: onboarding, CFDI, PWA | Dejar de ser consultoría y ser producto | 90–140 h |

**Total: 495–715 horas.** La auditoría estimó 250–450 h "hasta un v1 vendible":
eso corresponde a las **fases 0 a 4**, que son exactamente el mínimo con el que
un restaurante puede pagar y operar. Las fases 5 a 8 son la diferencia entre
vender uno y vender veinte.

### Ruta corta, si el objetivo es cobrar cuanto antes

Fases **0 → 1 → 2 → 3 → 4**, y de la fase 5 sólo **5.1 (inventario)** y **5.4
(landing desde la base)**. Con eso tienes un producto instalable, seguro,
notificando y con reportes. Todo lo demás puede esperar al primer cliente que lo
pida — y así se prioriza mejor que desde un documento.

---

# Fase 0 — Desanclaje: Postgres puro y deploy portátil

**Objetivo.** Que `git clone && docker compose up` levante el sistema completo en
una máquina limpia, sin cuenta en ningún proveedor, y que el mismo artefacto
corra igual en un VPS, en Railway, en Fly, en Render o en Vercel.

**Por qué va primero.** Cada fase posterior añade código; si el anclaje se queda,
lo añades encima y el costo de quitarlo crece. Además, sin un entorno
reproducible no puedes tener CI (fase 1), y sin CI no puedes tocar nada con
seguridad.

**Buenas noticias antes de empezar:** el anclaje real es **muy pequeño**. Grepeé
el repo entero. Supabase aparece en **once sitios y nueve de ellos son
comentarios**. El único acoplamiento funcional es el almacenamiento de imágenes,
que hoy está deshabilitado. Postgres es Postgres: la extensión `btree_gist` y la
`EXCLUDE constraint` que sostienen las reservaciones son de Postgres estándar, no
de Supabase, y funcionan igual en un contenedor `postgres:17`.

## 0.1 — Colapsar la configuración de base de datos

Hoy hay dos URLs porque el pooler de Supabase (pgbouncer en modo transacción) no
soporta los prepared statements de `prisma migrate`. **Con Postgres directo eso
desaparece**: una sola URL sirve para todo.

**`prisma.config.ts`** — que `DIRECT_URL` sea opcional:

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Una sola URL en el caso normal (Postgres directo). DIRECT_URL sólo
    // hace falta si algún día metes un pooler en modo transacción delante
    // de la app: migrate no puede hablar por ahí.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
```

**`lib/prisma.ts`** — reescribir el comentario de cabecera (que hoy explica el
pooler de Supabase) y **configurar el pool explícitamente**, que es lo que
importa fuera de serverless:

```ts
const adapter = new PrismaPg({
  connectionString,
  // Fuera de serverless la app es un proceso largo con su propio pool.
  // Fórmula: (max_connections de Postgres - reservadas) / número de réplicas.
  // Postgres 17 trae max_connections=100; con 2 réplicas y el worker,
  // 25 por proceso es holgado. Ver Apéndice A.
  max: Number(process.env.DATABASE_POOL_MAX ?? 25),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
```

**Mensaje de error:** el `throw` actual dice *"usa la URL del pooler de Supabase,
puerto 6543"*. Cámbialo por algo que sirva a quien despliega:
`"DATABASE_URL no está definida. Formato: postgresql://usuario:clave@host:5432/marea"`.

## 0.2 — Almacenamiento de imágenes sin Supabase Storage

Éste es el **único acoplamiento funcional real**. Hoy `lib/storage/config.ts`
sólo comprueba dos variables de Supabase y, si faltan, `ImageField.tsx` deshabilita
el dropzone y deja el campo de URL como única vía. Reemplázalo por un **driver**
con dos implementaciones.

**Nuevo `lib/storage/driver.ts`:**

```ts
import "server-only";

export type StoredFile = { url: string; key: string };

export interface StorageDriver {
  put(input: {
    body: Buffer;
    contentType: string;
    /** Ruta lógica: "menu-items/<cuid>.webp" */
    key: string;
  }): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  /** URL pública de una clave ya almacenada. */
  publicUrl(key: string): string;
}
```

**Dos implementaciones, ninguna atada a un proveedor:**

- **`local`** (`lib/storage/drivers/local.ts`) — escribe en un directorio del
  disco (`STORAGE_LOCAL_DIR`, montado como volumen de Docker) y lo sirve un route
  handler `app/api/media/[...key]/route.ts` con `Cache-Control` largo e
  inmutable. Es el modo por defecto en desarrollo y perfectamente válido en
  producción para un solo restaurante con un solo servidor.
- **`s3`** (`lib/storage/drivers/s3.ts`) — `@aws-sdk/client-s3` apuntando a
  `S3_ENDPOINT`. Esa sola variable te deja usar **MinIO** (autohospedado),
  **Cloudflare R2**, **Backblaze B2**, **Hetzner Object Storage**, el S3 de AWS
  o, si algún día quieres, el Storage de Supabase, que también habla S3. Eso es
  lo contrario de un anclaje: es la API de facto.

**`lib/storage/index.ts`** resuelve el driver una vez, según `STORAGE_DRIVER`, y
falla al arrancar si la configuración está incompleta — nunca en silencio a mitad
de una subida.

**Subida real** (`lib/storage/actions.ts`, Server Action):

1. `requireRole(...ADMIN_ROLES)` — primera línea, como el resto del proyecto.
2. Validar tamaño (≤ 5 MB) y tipo por **contenido**, no por la extensión ni por
   el `Content-Type` que manda el cliente: leer los primeros bytes (magic number)
   y aceptar sólo JPEG, PNG y WebP.
3. **Reprocesar con `sharp`**: redimensionar a un máximo (1600 px de lado largo),
   convertir a WebP, calidad 82. Esto normaliza el peso, **borra los metadatos
   EXIF** (que traen geolocalización del teléfono de quien tomó la foto) y
   neutraliza cualquier payload escondido en el archivo original.
4. Clave determinista: `menu-items/<cuid2>.webp`. Nunca el nombre que mandó el
   cliente.
5. Devolver la URL pública y guardarla en `MenuItem.imageUrl`.

**Borrado:** cuando un platillo cambia de imagen, encolar el borrado de la clave
vieja. No borrar en línea: si la transacción falla te quedas sin imagen y con la
fila apuntando a un 404.

**`ImageField.tsx`** deja de consultar `isStorageConfigured()` y pasa a ser un
dropzone real (con `useActionState` y vista previa), conservando el campo de URL
como alternativa para imágenes ya alojadas en otro lado.

## 0.3 — Deploy portátil: `output: "standalone"` + Docker

**`next.config.mjs`:**

```js
const nextConfig = {
  output: "standalone",
  turbopack: { root: __dirname },
  images: {
    // Sólo el host propio y el del storage. Nada de "**".
    remotePatterns: [
      { protocol: "https", hostname: process.env.MEDIA_HOSTNAME ?? "localhost" },
    ],
  },
  // headers() se añade en la fase 2.
};
```

`standalone` genera un `server.js` con sólo las dependencias que el build usó de
verdad. Es lo que hace que la imagen de Docker pese ~150 MB en vez de 1.2 GB, y
lo que hace que el mismo artefacto corra en cualquier host con Node.

**`Dockerfile`** — multi-etapa, usuario sin privilegios:

```dockerfile
# --- deps ---
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# --- runner ---
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# Migraciones y seed necesitan el CLI y el esquema:
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

**`docker-compose.yml`** — app + Postgres + worker (el worker llega en la fase 3;
déjalo comentado hasta entonces):

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: marea
      POSTGRES_USER: marea
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U marea"]
      interval: 5s
      retries: 10

  app:
    build: .
    depends_on:
      db: { condition: service_healthy }
    environment:
      DATABASE_URL: postgresql://marea:${POSTGRES_PASSWORD}@db:5432/marea
      AUTH_SECRET: ${AUTH_SECRET}
      AUTH_URL: ${AUTH_URL}
      STORAGE_DRIVER: local
      STORAGE_LOCAL_DIR: /data/media
    volumes:
      - media:/data/media
    ports: ["3000:3000"]

volumes:
  pgdata:
  media:
```

**Migraciones en despliegue.** Nunca `prisma migrate dev` fuera de tu máquina. Un
paso explícito, previo al arranque de la app:

```bash
npx prisma migrate deploy
```

En Compose, un servicio `migrate` de un solo uso con `depends_on: db`; en una
plataforma PaaS, el "release command". El seed **jamás** corre automáticamente:
`prisma/seed.ts` crea usuarios con contraseñas conocidas del README.

**Health check** — `app/api/health/route.ts`, sin autenticación, que haga un
`SELECT 1` y devuelva `{ ok, db, version }`. Lo necesitan el balanceador, Docker,
Kubernetes y el monitor de disponibilidad. Que responda 503 si la base no
contesta, no 200 con un campo en falso.

**`.dockerignore`** — al menos: `node_modules`, `.next`, `.git`, `dist`,
`ds-bundle`, `graphify-out`, `.agents`, `.claude`, `.design-sync`, `.ds-sync`,
`*.tsbuildinfo`, `.env*`.

## 0.4 — Quitar los supuestos de Vercel del código

Tres sitios asumen que estás en Vercel. Ninguno es grave; los tres se vuelven
bugs si despliegas en otro lado.

**(a) `getClientIp` en `lib/auth/rate-limit.ts`.** Toma el primer valor de
`x-forwarded-for`. Eso es correcto **sólo** si el proxy de enfrente reescribe la
cabecera. Con nginx mal configurado, cualquiera manda la suya y evade todos los
límites por IP, incluido el de reservaciones.

```ts
// Número de proxies de confianza entre el cliente e esta app.
// Vercel/Cloudflare: 1. nginx propio: 1. Sin proxy: 0.
const TRUSTED_PROXIES = Number(process.env.TRUSTED_PROXY_COUNT ?? 1);

export function getClientIp(headers: { get(n: string): string | null }): string {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (chain.length === 0) return headers.get("x-real-ip")?.trim() ?? "unknown";
  // Con N proxies de confianza, la IP real es la N-ésima desde el final.
  // Cualquier valor que el cliente haya inyectado queda a la izquierda.
  const index = Math.max(0, chain.length - 1 - TRUSTED_PROXIES);
  return chain[index] ?? "unknown";
}
```

Y documentar en el README de despliegue la configuración de nginx que lo hace
cierto (`real_ip_header`, `set_real_ip_from`).

**(b) `MAX_LIFETIME_MS` en `app/api/orders/stream/route.ts`.** Los 75 segundos
existen porque en Vercel cada conexión SSE abierta es una invocación facturada de
forma continua. En un servidor propio eso no aplica y cortar cada 75 s es
gratuito pero innecesario. Vuélvelo configurable:
`SSE_MAX_LIFETIME_MS` con 75 000 por defecto, y documenta que en un despliegue
de proceso largo puedes subirlo a 15 minutos o desactivarlo (`0`).
Los comentarios del archivo que hablan de Supabase Realtime se reescriben en la
fase 6, cuando el polling se sustituya de verdad.

**(c) `appOrigin()` en `app/admin/(shell)/mesas/imprimir/page.tsx`.** Reutiliza
`AUTH_URL` porque "es el origen que Auth.js ya considera canónico". Es un
préstamo razonable, pero el QR impreso es demasiado caro para depender de una
variable que existe por otro motivo. Introduce `APP_ORIGIN`, con `AUTH_URL` como
respaldo, y **falla el arranque en producción si ninguna está definida** — un QR
impreso apuntando a `http://localhost:3000` son cincuenta mesas reimpresas.

## 0.5 — Limpiar el rastro de Supabase en documentación y comentarios

Nueve de las once menciones son comentarios. Hay que tratarlas distinto según
dónde estén:

| Archivo | Qué hacer |
|---|---|
| `prisma/schema.prisma:62` (bloque `datasource`) | Reescribir: una sola URL, Postgres estándar |
| `prisma/schema.prisma:939` (`OrderStatusEvent`) | Cambiar "Supabase Realtime escucha INSERTs" por "el proceso de tiempo real escucha vía `LISTEN/NOTIFY`" (fase 6) |
| `prisma/schema.prisma:1367` (bloque IA comentado) | `CREATE EXTENSION vector` es de **pgvector**, no de Supabase. Corregir la atribución |
| `lib/prisma.ts` | Cabecera y mensaje de error, ver 0.1 |
| `lib/storage/config.ts` | Se elimina; lo sustituye `lib/storage/index.ts` |
| `components/admin/menu/ImageField.tsx` | Se elimina el comentario al conectar la subida real |
| `app/api/orders/stream/route.ts` | Se reescribe en la fase 6 |
| `docs/DATABASE.md` §4 | Sustituir "Detalles de Supabase que muerden" por "Puesta en marcha con Postgres"; la nota de RLS se conserva pero reencuadrada: **RLS es de Postgres**, no de Supabase, y es el plan de la fase 7.3 |
| `docs/prompts/01,02,03` | **No se editan.** Son el registro de lo que se pidió en su momento. Añadir al principio de cada uno una línea de errata que nombre lo que quedó sin efecto en *ese* documento: el Storage de Supabase en el 01, Supabase Realtime y la facturación de Vercel en el 02, el tope de vida del SSE en el 03 |

## 0.6 — Higiene del paquete

- **Separar la app de la librería de componentes.** El `package.json` declara
  `main`, `module`, `types`, `exports` y un script `build:lib` con tsup: hoy la
  aplicación y una librería publicable viven en el mismo paquete y el mismo
  `node_modules`. Decide una de dos y ejecútala: o la librería se mueve a
  `packages/ui/` con su propio `package.json` (y el repo pasa a workspaces), o
  esos cinco campos y los dos scripts se borran. Ambigüedad de identidad en el
  manifiesto es lo primero que confunde a quien recibe el proyecto.
- **`engines`:** `{ "node": ">=22" }`. El build lo asume, dilo en voz alta.
- **Limpiar el árbol:** `dist/`, `ds-bundle/`, `graphify-out/` y `.next/` están
  ignorados por git pero ocupan sitio y confunden. Bórralos del disco antes de
  entregar el proyecto a nadie.
- **`.env.example`** se reescribe entero según el Apéndice A.

## Criterio de terminado — Fase 0

- [ ] `docker compose up --build` en una máquina limpia levanta db + app, aplica
      migraciones y la landing responde en `:3000`.
- [ ] `npm run db:seed` funciona contra ese Postgres y `/admin/login` acepta las
      credenciales sembradas.
- [ ] `grep -ri supabase app/ lib/ components/ prisma/schema.prisma` devuelve
      **cero** resultados.
- [ ] `grep -ri vercel app/ lib/ components/` devuelve **cero** resultados.
- [ ] Subir una foto de platillo funciona con `STORAGE_DRIVER=local` **y** con
      `STORAGE_DRIVER=s3` apuntando a un MinIO local.
- [ ] La imagen subida sale en WebP, sin EXIF, con nombre generado.
- [ ] `/api/health` devuelve 200 con la base arriba y 503 con la base caída.
- [ ] Una reservación sigue chocando contra la `EXCLUDE constraint` en el
      Postgres del contenedor (prueba manual: dos inserts solapados).
- [ ] `.env.example` documenta todas las variables y ninguna sobra.

## Riesgos de esta fase

- **`sharp` en Alpine** necesita `libc6-compat` (ya está en el Dockerfile) o te
  come una tarde con un error de binding poco informativo.
- **La migración de `btree_gist`** requiere que el usuario de Postgres pueda
  crear extensiones. En un Postgres gestionado que no lo permita, hay que
  pedirlo al proveedor. Verifícalo **antes** de elegir hosting.
- **Cuidado con `output: "standalone"` y los archivos que el build no ve.** Las
  fuentes de `next/font` sí se incluyen; `prisma/schema.prisma` no, por eso se
  copia explícitamente.

---

# Fase 1 — Red de seguridad: integración continua y pruebas

**Objetivo.** Que un cambio equivocado en una ruta de dinero **no llegue a
`main`**. Hoy nada lo impide: no existe `.github/`, y los cuatro archivos de test
(~700 líneas sobre 19,044) cubren sólo módulos puros — disponibilidad, esquemas,
horarios y numeración de mesas.

**Por qué va aquí.** Es la deuda número uno del proyecto. Todo lo que viene
después toca `Order`, `Payment` o el esquema; hacerlo sin red es apostar.

## 1.1 — Integración continua

`.github/workflows/ci.yml`, dos trabajos:

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx prisma generate
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npx vitest run --project=unit

  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: marea_test
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-retries 10
        ports: ["5432:5432"]
    env:
      DATABASE_URL: postgresql://postgres:test@localhost:5432/marea_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npx vitest run --project=integration --coverage
```

Y **protección de rama** en `main`: sin CI verde no hay merge. Un CI que se puede
saltar no es un CI, es un adorno.

**Nota de portabilidad:** si mañana no quieres GitHub, el mismo par de trabajos
se traduce casi línea por línea a GitLab CI o a Forgejo Actions. Lo que importa
son los cuatro comandos: `tsc --noEmit`, `lint`, `vitest unit`, `vitest
integration` contra un Postgres real.

## 1.2 — Infraestructura de pruebas de integración

Separar `vitest.config.mts` en dos proyectos:

- **`unit`** — entorno `node`, sin base de datos. Es lo que ya existe.
- **`integration`** — un Postgres real, un **esquema por worker** para que las
  pruebas corran en paralelo sin pisarse:

```ts
// test/setup-integration.ts
// Cada worker de vitest se lleva su propio schema de Postgres. Es más rápido
// que una base por archivo y evita el truncate global que serializa todo.
const schema = `test_${process.env.VITEST_WORKER_ID ?? "1"}`;
process.env.DATABASE_URL = `${base}?schema=${schema}`;
// beforeAll: migrate deploy sobre ese schema. afterEach: TRUNCATE ... CASCADE
// de todas las tablas salvo _prisma_migrations.
```

Y un módulo de **factories** (`test/factories.ts`): `makeBusiness()`,
`makeMenuItem()`, `makeCart()`, `makeOrder()`, `makeStaff(role)`. Sin factories,
cada test empieza con cuarenta líneas de setup y nadie escribe el segundo test.

## 1.3 — Las pruebas que faltan, en orden de riesgo

**(a) `createOrderFromCart` — la más importante del proyecto.**

- Precio congelado: cambiar `basePrice` después de meter al carrito y verificar
  que el `OrderItem` guarda el precio del momento de ordenar.
- Impuesto: `subtotal * taxRate` redondeado a dos decimales, contra un caso con
  decimales feos (`taxRate` 0.16 sobre 33.33).
- **Doble envío concurrente:** dos llamadas simultáneas con la misma cookie de
  carrito producen **un solo pedido**; la segunda recibe `empty_cart`. Esto
  prueba el `FOR UPDATE` sobre `Cart`, que es la razón de existir de ese lock.
- Stock: dos checkouts concurrentes sobre un platillo con `stockQuantity: 1`
  → uno pasa, el otro recibe `item_unavailable`; el stock nunca queda negativo.
- Platillo dado de baja, categoría desactivada, modificador no disponible, grupo
  que se volvió obligatorio después de armar el carrito.
- Que el `NotificationJob` se cree **dentro** de la transacción: si el
  `order.create` falla, no queda job huérfano.

**(b) Webhook de Stripe.**

- Firma inválida → 400 y **ningún** efecto en la base.
- Redelivery del mismo `event.id` → el efecto se aplica **una vez**; la segunda
  llamada responde 2xx sin tocar nada.
- `payment_intent.succeeded` sobre un intent desconocido → no-op silencioso.
- `charge.refunded` parcial → `PARTIALLY_REFUNDED` y una fila `Refund`; total →
  `REFUNDED`.
- `charge.refunded` con más de 10 reembolsos → `autoPagingToArray` los trae
  todos (el bug que ese código existe para evitar).
- Transición ilegal → se registra y no se aplica.

**(c) `board-actions`.**

- `advanceOrderStatusAction` respeta `getNextStatus` y rechaza un salto.
- `cancelOrderAction` con un platillo `trackInventory` **devuelve el stock** y
  vuelve a poner `isAvailable` si cruzó de cero.
- `collectCashPaymentAction` sobre un pedido ya liquidado con tarjeta →
  `already_settled`.
- Cobro y cancelación concurrentes → uno gana, el otro falla limpio. Nunca un
  pedido cancelado y cobrado a la vez.

**(d) La matriz de permisos, dirigida por tabla.**

`docs/product/roles-y-alcance.md` ya tiene la matriz escrita. Conviértela en un
test: por cada Server Action, por cada rol, permitir o denegar. Es un solo
archivo de ~120 líneas y es el que evita que una acción nueva se publique sin
`requireRole`. Añade además el caso `revoked: true` y el caso
`mustChangePassword: true`, que `requireRole` ya contempla.

**(e) Reservaciones — integración, no sólo unidad.**

Lo que hay es puro y excelente. Falta el test que sólo una base real puede dar:
dos `createReservationAction` concurrentes sobre el mismo hueco → uno crea, el
otro recibe `slot_taken` **por la `EXCLUDE constraint`**, no por el chequeo
previo. Ese test es el que demuestra que la garantía es real.

## 1.4 — Cobertura y umbral

`vitest --coverage` con umbral que **rompa el CI**:

- `lib/orders/**`, `lib/payments/**`, `lib/reservations/**`: **90 %** de líneas.
- Resto de `lib/`: 70 %.
- `components/` y `app/`: sin umbral. Cubrir JSX con tests unitarios da métrica y
  no da confianza.

## 1.5 — Tres pruebas E2E, ni una más

Playwright, contra el contenedor de la fase 0:

1. Reservar desde la landing → recibir un código → consultarlo en `/r/<código>`
   → cancelarlo.
2. Escanear `/t/<qrToken>` → agregar dos platillos con modificadores → checkout
   → llegar a `/o/<publicToken>`.
3. Login como STAFF → avanzar ese pedido a `READY` → verificar que la pantalla
   pública del pedido lo refleja.

Tres flujos cubren el 80 % del riesgo de integración de la interfaz. Veinte
flujos E2E se vuelven un segundo trabajo de mantenimiento y terminan
desactivados.

## Criterio de terminado — Fase 1

- [ ] CI verde y obligatorio en `main`.
- [ ] `npx vitest run` pasa en local contra un Postgres de Docker.
- [ ] Los cinco bloques de 1.3 existen y fallan si rompes a propósito el código
      que protegen (verifícalo mutando una línea y viendo el rojo).
- [ ] Umbral de cobertura activo y en verde.
- [ ] Los tres E2E corren en CI en menos de 3 minutos.

---

# Fase 2 — Endurecimiento de seguridad

**Objetivo.** Cerrar los tres hallazgos altos y los seis medios de la auditoría.
Ninguno es exótico; todos son la diferencia entre "funciona" y "se puede exponer
a internet con dinero de por medio".

**Por qué después de la fase 1.** Varios de estos cambios tocan el callback `jwt`
y la sesión: sin la matriz de permisos automatizada, romper la autenticación en
silencio es demasiado fácil.

## 2.1 — Sesión y contraseñas (hallazgo alto A1)

Hoy `changePasswordAction` sólo comprueba que haya sesión. Tres cambios:

**(a) Exigir la contraseña actual.** Salvo cuando `mustChangePassword` es true —
ahí el usuario está usando una contraseña temporal que el admin le dictó, y
pedírsela otra vez es fricción sin ganancia:

```ts
const user = await prisma.user.findUnique({ where: { id: session.user.id } });
if (!user?.mustChangePassword) {
  const ok = await verifyPassword(user.passwordHash ?? DUMMY_HASH, currentPassword);
  if (!ok) return { error: "invalidCurrentPassword" };
}
```

**(b) Invalidar los JWT de los demás dispositivos.** Un JWT no se puede revocar
del lado del servidor; el proyecto ya resolvió eso una vez con el flag `revoked`.
Aplica el mismo patrón:

```prisma
model User {
  // ...
  /// Momento del último cambio de contraseña. El callback `jwt` compara este
  /// valor contra la emisión del token: cualquiera anterior queda revocado.
  /// Es la única forma de echar de una sesión JWT a alguien que sigue siendo
  /// un usuario válido — el flag `revoked` sólo cubre la baja de la cuenta.
  passwordChangedAt DateTime?
}
```

Y en el callback `jwt` de `auth.ts`, dentro de la revalidación que ya existe:

```ts
if (dbUser.passwordChangedAt && token.iat &&
    dbUser.passwordChangedAt.getTime() > token.iat * 1000) {
  token.revoked = true;
  return token;
}
```

Ojo con la ventana: la revalidación corre cada `REVALIDATE_INTERVAL_MS` (60 s),
así que la expulsión tarda hasta un minuto. Es aceptable y hay que documentarlo.

**(c) Política de contraseñas.** Mínimo **12** caracteres y `zxcvbn` con puntaje
≥ 3, o contraste contra el rango k-anonimizado de Have I Been Pwned (cinco
caracteres del SHA-1, sin mandar la contraseña a ningún lado). El generador de
contraseñas temporales del panel ya es correcto: 12 caracteres de CSPRNG con
alfabeto sin ambigüedades. El problema es sólo el mínimo del formulario de
cambio.

**(d) Recuperación de contraseña.** Tabla nueva `PasswordResetToken` (hash del
token, `userId`, `expiresAt` de 30 minutos, `usedAt`), respuesta **siempre
idéntica** haya o no cuenta con ese correo, límite por IP y por correo con el
`isScopeRateLimited` que ya existe. El envío depende de la fase 3: deja el flujo
completo escrito y **encolando un `NotificationJob`**; en cuanto el worker exista,
funciona sin tocar una línea.

**(e) MFA (TOTP) opcional para `BUSINESS_ADMIN` y superior.** `otpauth` para
generar y validar; la librería `qrcode` ya está en el proyecto para pintar el
código de aprovisionamiento. Ocho códigos de respaldo de un solo uso, guardados
como hash. Opcional por usuario, obligable por negocio en la fase 7.

## 2.2 — Cabeceras de seguridad (hallazgo alto A2)

`next.config.mjs` no define ninguna. El panel es encuadrable en un iframe, lo que
convierte "Cancelar pedido" y "Reembolsar" en objetivos de clickjacking.

```js
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

async headers() {
  return [{ source: "/:path*", headers: securityHeaders }];
}
```

**La CSP merece su propio párrafo** porque hay un obstáculo real: el script
inline de tema en `app/layout.tsx` (el que fija `data-theme` antes del pintado
para evitar el flash) obliga a `unsafe-inline`, que anula media CSP. La salida
correcta es un **nonce por request**, generado en `proxy.ts` y leído en el layout:

```ts
// proxy.ts — junto al guard de /admin que ya existe
const nonce = crypto.randomUUID().replaceAll("-", "");
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
  `style-src 'self' 'unsafe-inline'`,           // Tailwind inyecta estilos
  `img-src 'self' data: https://${mediaHost}`,
  `font-src 'self' data:`,
  `connect-src 'self' https://api.stripe.com`,
  `frame-src https://js.stripe.com https://hooks.stripe.com`,  // 3D Secure
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join("; ");
```

Y en `app/layout.tsx`, `const nonce = (await headers()).get("x-nonce")` pasado al
`<script nonce={nonce}>`. **Cuidado:** `frame-src` de Stripe es obligatorio o el
modal de 3D Secure deja de aparecer y los pagos con verificación se rompen en
silencio. Pruébalo con la tarjeta `4000 0025 0000 3155` que ya documenta el
README.

## 2.3 — Cookies (hallazgo alto A3)

`marea-cart`, `marea-table` y las de idioma llevan `httpOnly` y `sameSite: "lax"`
pero no `secure`. En Vercel el HTTPS lo salva por accidente; en el despliegue
propio de la fase 0, no.

```ts
const isProd = process.env.NODE_ENV === "production";
store.set(CART_COOKIE, token, {
  httpOnly: true, sameSite: "lax", secure: isProd, path: "/", maxAge: CART_COOKIE_MAX_AGE,
});
```

Aplica en `lib/cart/cookie.ts` (dos funciones) y `lib/i18n/actions.ts`.

## 2.4 — Rate limit del circuito público (hallazgo medio M1)

Las reservaciones sí lo tienen. El pedido **no**: `addToCartAction`,
`updateCartItemQuantityAction`, `createOrderAction` y `createPaymentIntentAction`
están abiertas. Un script llena el tablero de cocina de pedidos falsos en
minutos, consume `Business.orderSequence` y crea filas `Payment` y
`NotificationJob`. No es robo de datos: es **denegación de servicio operativa**,
que en un restaurante es peor.

Scopes nuevos, reusando `isScopeRateLimited`:

| Scope | Límite | Ventana |
|---|---|---|
| `order:create` | 5 | 15 min |
| `cart:mutate` | 60 | 15 min |
| `payment:intent` | 10 | 15 min |
| `password:reset` | 5 | 60 min |

Y **saca todo esto de `LoginAttempt`** (deuda D5 de la auditoría). Esa tabla hoy
guarda intentos de login *y* contadores genéricos en su columna `email`, con un
contrato "un scope nunca contiene `@`" impuesto con un `throw` — que ya provocó un
bug real (commit `9f80c20`). Tabla propia:

```prisma
model RateLimitCounter {
  id        String   @id @default(cuid())
  scope     String   // "order:create", "reservation:cancel", ...
  key       String   // IP, correo, o lo que el scope defina como identidad
  createdAt DateTime @default(now())

  @@index([scope, key, createdAt])
}
```

La migración mueve las filas existentes y `assertValidScope` desaparece: sin
columna compartida, no hay contrato frágil que imponer.

## 2.5 — Proxy de confianza (hallazgo medio M2)

Ya resuelto en la fase 0.4(a). Aquí sólo queda el test: pedir con un
`x-forwarded-for` falsificado y comprobar que el límite **sí** se aplica.

## 2.6 — Roles: último administrador y bitácora (hallazgo medio M3)

Un `BUSINESS_ADMIN` puede crear otro y desactivar la membresía de cualquiera
excepto la suya. No hay protección de "último admin" ni rastro de quién cambió
qué. Contrasta con el cuidado que sí se puso en `OrderStatusEvent.changedById` y
`Refund.createdById`: la trazabilidad se aplicó al dinero pero no al acceso.

**(a)** En `setTeamMemberActiveAction`, antes de desactivar: contar membresías
activas con rol `BUSINESS_ADMIN` o superior; si queda una, rechazar con
`last_admin`.

**(b)** Tabla `MembershipEvent` con el mismo patrón que ya usas:

```prisma
model MembershipEvent {
  id           String   @id @default(cuid())
  membershipId String
  changedById  String?
  fromRole     UserRole?
  toRole       UserRole?
  fromActive   Boolean?
  toActive     Boolean?
  createdAt    DateTime @default(now())

  membership BusinessMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  changedBy  User?              @relation(fields: [changedById], references: [id], onDelete: SetNull)

  @@index([membershipId, createdAt])
}
```

**(c)** Falta además una acción de **cambiar el rol** de un miembro: hoy sólo se
puede crear y activar/desactivar. Con la bitácora ya en su sitio, agrégala.

## 2.7 — Rotación del QR de mesa (hallazgo medio M5)

`qrToken` es cuid2 —correcto, no adivinable— pero no caduca. Quien fotografíe el
código sigue ordenando desde su casa indefinidamente. El esquema previó el
problema (`qrRotatedAt`) pero nadie lo dispara.

- Botón "Rotar QR" por mesa en `/admin/mesas`, que genera un `createId()` nuevo,
  sella `qrRotatedAt` y avisa con claridad de que **hay que reimprimir**.
- Acción masiva "rotar toda una zona".
- Y una decisión de producto que hay que tomar de forma explícita: ¿el QR de
  mesa debería exigir además que el pedido salga de la red del local, o de una
  sesión abierta en las últimas N horas? Recomendación: **no** en la v1 —
  romperías el caso legítimo del cliente que pide desde la terraza con datos
  móviles. Rotación manual y punto.

## 2.8 — Superficie menor pero real

- **`imageUrl`** acepta hoy cualquier URL vía `z.string().url()`, incluidas
  `javascript:` y `http:`. Inerte dentro de un `<img src>`, pero permite
  contenido mixto y rastreo de terceros. Restringir a `https` y a una lista de
  hosts permitidos (el propio, y el del storage de la fase 0.2).
- **Retención de datos.** `LoginAttempt` guarda direcciones IP: son dato personal
  bajo la LFPDPPP. Hace falta (a) una tarea programada que purgue contadores y
  registros de intento pasados los 90 días, (b) anonimizar `guestEmail`,
  `guestPhone` y `guestName` de pedidos y reservaciones con más de 24 meses
  —conservando los importes, que son contabilidad—, y (c) un aviso de privacidad
  enlazado desde el formulario de reservas y el checkout. Esto no es opcional si
  vas a vender el sistema: es lo primero que pregunta un cliente con abogado.
- **`prisma/seed.ts` blindado.** Que se niegue a correr si `NODE_ENV` es
  `production` o si `DATABASE_URL` no apunta a localhost, salvo con una variable
  `I_KNOW_WHAT_IM_DOING=1`. El README publica las contraseñas de demo; un seed
  accidental en producción crea tres cuentas con credenciales públicas.

## Criterio de terminado — Fase 2

- [ ] Cambiar la contraseña exige la actual y **expulsa** a los demás dispositivos
      (test de integración que lo demuestra).
- [ ] `curl -I` sobre `/` y sobre `/admin` muestra las seis cabeceras.
- [ ] El panel **no** se puede cargar dentro de un `<iframe>`.
- [ ] La CSP está activa y el pago con 3D Secure sigue funcionando de punta a
      punta.
- [ ] Las cuatro acciones públicas devuelven `rate_limited` al superar su cuota.
- [ ] `LoginAttempt` ya no guarda scopes; `assertValidScope` fue eliminada.
- [ ] No se puede desactivar al último administrador.
- [ ] Existe aviso de privacidad y la tarea de retención corre.

---

# Fase 3 — Notificaciones reales

**Objetivo.** Que salga un correo. Hoy no sale ninguno: `NotificationJob` se
encola correctamente dentro de la transacción —patrón outbox, impecable— en
reservas, checkout y cambios de estado, y **no existe ningún consumidor**. Las
filas se acumulan en `QUEUED` para siempre.

**Por qué importa tanto.** Es el bloqueador de venta número uno. Un restaurante
que no puede avisar "tu mesa está confirmada" no compra el sistema, por bien
construido que esté todo lo demás. Y la fase 2 dejó la recuperación de contraseña
esperando exactamente esto.

## 3.1 — Un contrato de envío, dos implementaciones

Mismo principio que el storage de la fase 0: interfaz primero, proveedor después.

```ts
// lib/notifications/mailer.ts
export interface Mailer {
  send(msg: {
    to: string;
    subject: string;
    html: string;
    text: string;
    /** Para deduplicar del lado del proveedor cuando lo soporta. */
    idempotencyKey?: string;
  }): Promise<{ providerMessageId: string | null }>;
}
```

- **`smtp`** (nodemailer) — el driver por defecto. Habla con **cualquier** cosa:
  un Postfix propio, Zoho, Brevo, Mailgun, el SMTP de SES, o un MailHog local
  para desarrollo. Cero anclaje: es un protocolo, no un producto.
- **`resend`** — opcional, porque su API de plantillas y su panel de entregas son
  cómodos. Detrás de la misma interfaz, sustituible en una línea de configuración.

Para desarrollo, un tercer driver `console` que sólo imprime: así el worker se
prueba sin credenciales de nadie.

## 3.2 — Plantillas

Las seis que el código ya encola, más la de la fase 2:

| `templateKey` | Se dispara en |
|---|---|
| `reservation.confirmed` | `createReservationAction` |
| `order.confirmed` | `createOrderFromCart` |
| `order.ready` | `advanceOrderStatusAction` |
| `order.delivered` | `advanceOrderStatusAction` |
| `order.cancelled` | `cancelOrderAction` |
| `password.reset` | fase 2.1(d) |

Cada una en **es** y **en**, resueltas por el campo `locale` que el job ya
guarda. `react-email` es la opción cómoda (componentes React → HTML compatible
con clientes de correo, que es un infierno de tablas anidadas si lo haces a
mano). Cada plantilla genera **HTML y texto plano**; el texto no es opcional, es
lo que evita la carpeta de spam.

Detalle que ya está bien resuelto y no hay que romper: los correos de cambio de
estado usan `business.defaultLocale` porque el pedido no persiste el idioma con
que navegaba el invitado. Si quieres mejorarlo, la vía correcta es **añadir
`Order.locale`** en el checkout, no adivinar.

## 3.3 — El worker

El esquema **ya documenta el algoritmo exacto** en el comentario de
`NotificationJob`. Impleméntalo tal cual:

```sql
SELECT ... FROM "NotificationJob"
WHERE status = 'QUEUED' AND "runAfter" <= now()
ORDER BY "runAfter" LIMIT 20
FOR UPDATE SKIP LOCKED;
```

`SKIP LOCKED` es lo que permite correr varios workers sin coordinación externa.
El lease (`lockedAt`, `lockedBy`) permite que otro worker robe un trabajo cuyo
dueño murió a media ejecución. El backoff es exponencial sobre `attempts` hasta
`maxAttempts` (5, por defecto del esquema), y `dedupeKey` ya impide el doble
envío por doble clic.

**Dos modos de ejecución, y ésta es la decisión de portabilidad de la fase:**

- **Proceso largo** (`scripts/worker.ts`, servicio propio en `docker-compose.yml`)
  — el modo recomendado. Hace `poll → procesa → duerme 5 s`, apagado limpio con
  `SIGTERM` para no dejar trabajos bloqueados.
- **Endpoint invocable** (`app/api/cron/notifications/route.ts`, protegido por un
  token en cabecera) — para plataformas serverless donde no puedes tener un
  proceso. Lo llama el cron de la plataforma cada minuto.

**Ambos comparten exactamente la misma función** `processQueue(limit)`. El modo
sólo cambia quién la llama. Eso es lo que evita que la elección de hosting se
filtre a la lógica.

## 3.4 — WhatsApp y SMS (opcional, pero muy rentable en México)

`NotificationChannel` ya tiene `SMS` y `WHATSAPP` en el enum. Un driver Twilio
(o el proveedor local que prefieras) detrás de la misma interfaz `Notifier`
convierte "tu mesa está lista" en un mensaje que la gente **sí** lee. En un
restaurante mexicano, WhatsApp tiene una tasa de apertura que el correo no roza,
y es un argumento de venta por sí solo.

Empieza por correo, deja el canal listo, véndelo como plan superior.

## 3.5 — Observabilidad de la cola

Sin esto, el worker falla en silencio y te enteras por un cliente enojado:

- Métrica de profundidad de cola (`QUEUED` con `runAfter <= now()`).
- Alerta si algún job llega a `attempts >= maxAttempts`.
- Pantalla en `/admin/configuracion` con los últimos 50 envíos y su estado. El
  dueño quiere poder responder "¿le llegó su confirmación al cliente?" sin
  llamarte.

## Criterio de terminado — Fase 3

- [ ] Reservar en la landing produce un correo real en MailHog local.
- [ ] Con el driver `smtp` apuntando a un proveedor real, el correo llega a
      Gmail **sin caer en spam** (SPF, DKIM y DMARC configurados y verificados).
- [ ] Matar el worker a media ejecución y reiniciarlo: el trabajo se recupera y
      **no se envía dos veces**.
- [ ] Un job que falla 5 veces queda en `FAILED` con su `lastError` y dispara
      alerta.
- [ ] La recuperación de contraseña de la fase 2 funciona de punta a punta.
- [ ] La cola se puede ver desde el panel.

---

# Fase 4 — Operación diaria: reportes, corte de caja y comanda

**Objetivo.** Construir las pantallas que el dueño abre **todos los días**. Es la
fase que convierte un sistema bien hecho en un sistema que se paga.

**Por qué aquí.** Las fases 0–3 hacen que el sistema sea desplegable, seguro y
comunicativo. Ésta es la primera que añade valor que el cliente *ve*. Y las tres
piezas dependen de que los datos ya sean confiables: sin las pruebas de la fase 1
no publicas un reporte de ventas, porque un reporte equivocado destruye la
confianza más rápido de lo que la construye una interfaz bonita.

## 4.1 — Reportes de venta

Los índices ya existen: `@@index([businessId, placedAt])` sobre `Order` fue puesto
exactamente para esto, y `@@index([menuItemId])` sobre `OrderItem` está comentado
en el esquema como *"cuántas langostas vendimos este mes"*. El trabajo es de
consulta y presentación, no de esquema.

**Pantalla `/admin/reportes`**, con un selector de rango (hoy, ayer, 7 días, mes,
personalizado) resuelto **en la zona horaria del negocio** — reutiliza
`businessLocalDateParts` y `localWallClockToUtc` de `lib/reservations/availability.ts`,
que ya hacen esa conversión bien, incluido el horario de verano. No escribas la
tercera versión de esa matemática.

Métricas, en este orden de importancia:

1. **Ventas del periodo**: total, número de pedidos, ticket promedio, comparación
   contra el periodo anterior equivalente.
2. **Ventas por día** (barras) — el gráfico que se mira primero.
3. **Por método de pago**: efectivo vs. tarjeta, con el total a conciliar contra
   el cajón.
4. **Platillos más vendidos** por unidades e por ingreso. No son la misma lista y
   la diferencia entre ambas es información de negocio pura.
5. **Por tipo de pedido**: mesa vs. para llevar.
6. **Por empleado**: usa `Order.staffId` y `Payment.collectedByUserId`, que ya
   existen precisamente para esto.
7. **Cancelaciones y reembolsos** con motivo y autor: `OrderStatusEvent` y
   `Refund.createdById` ya lo guardan todo.

**Reglas que evitan reportes mentirosos:**

- Los importes salen de los **totales congelados** del pedido (`Order.subtotal`,
  `taxTotal`, `total`), nunca recalculados desde el catálogo vivo. El esquema ya
  argumenta por qué.
- Las cancelaciones **no** cuentan como venta pero **sí** se muestran, aparte.
- Los reembolsos se restan del periodo en que se emitieron, no de aquel en que se
  cobró el pedido original. Es lo que hace un contador y evita cuadres imposibles.
- **Exportación a CSV** de cada tabla. El contador del restaurante no va a entrar
  a tu panel: quiere un archivo.

**Rendimiento:** con más de ~50 000 pedidos, las agregaciones en vivo empiezan a
molestar. Cuando llegue ese momento —y no antes—, una tabla `DailySalesSnapshot`
calculada por el worker cada madrugada. Anótalo, no lo construyas todavía.

## 4.2 — Corte de caja

Es la migración de esquema más grande de este plan, y está justificada: sin corte
de caja el dinero en efectivo no cuadra con el sistema, y ese es el momento
exacto en que un restaurante deja de confiar en un software.

```prisma
/// Turno de caja: de la apertura con fondo fijo al arqueo del cierre.
/// Existe porque `Payment.collectedByUserId` dice *quién* cobró pero no *en qué
/// turno*, y sin esa agrupación no hay forma de contar el cajón contra el
/// sistema al final de la noche.
model CashSession {
  id         String @id @default(cuid())
  businessId String

  openedById   String
  openedAt     DateTime @default(now())
  /// Fondo con el que se abre la caja.
  openingFloat Decimal  @db.Decimal(10, 2)

  closedById     String?
  closedAt       DateTime?
  /// Lo que el sistema dice que debería haber: fondo + cobros en efectivo
  /// del turno − retiros. Congelado al cerrar, igual que los totales de Order.
  expectedAmount Decimal? @db.Decimal(10, 2)
  /// Lo que la persona contó de verdad.
  countedAmount  Decimal? @db.Decimal(10, 2)
  /// countedAmount − expectedAmount. Guardado y no derivado: es el número que
  /// se audita y no puede cambiar si mañana se corrige un pago viejo.
  difference     Decimal? @db.Decimal(10, 2)
  notes          String?

  business  Business      @relation(fields: [businessId], references: [id], onDelete: Cascade)
  openedBy  User          @relation("CashOpenedBy", fields: [openedById], references: [id])
  closedBy  User?         @relation("CashClosedBy", fields: [closedById], references: [id])
  payments  Payment[]
  movements CashMovement[]

  @@index([businessId, openedAt])
}

/// Entradas y salidas de efectivo que no son un pedido: retiro a la bóveda,
/// pago al proveedor de verduras, cambio de billete. Sin esto, la diferencia
/// del arqueo siempre "falla" y el corte deja de servir.
model CashMovement {
  id            String   @id @default(cuid())
  cashSessionId String
  type          CashMovementType
  amount        Decimal  @db.Decimal(10, 2)
  reason        String
  createdById   String
  createdAt     DateTime @default(now())

  session   CashSession @relation(fields: [cashSessionId], references: [id], onDelete: Cascade)
  createdBy User        @relation(fields: [createdById], references: [id])

  @@index([cashSessionId, createdAt])
}

enum CashMovementType { DEPOSIT WITHDRAWAL }
```

Y en `Payment`, una columna: `cashSessionId String?` con su índice. Se llena en
`collectCashPaymentAction`, que además debe **rechazar el cobro si no hay caja
abierta** — es la regla que hace que el corte tenga sentido.

**Flujo:** abrir turno (fondo inicial) → cobros de efectivo se atan solos al
turno abierto → registrar retiros y depósitos → cerrar turno contando el cajón →
el sistema muestra esperado, contado y diferencia, y lo congela.

**Permiso:** abrir y cerrar caja es `STAFF` (lo hace el cajero); ver el histórico
de cortes y las diferencias es `BUSINESS_ADMIN`. Añádelo a la matriz de
`docs/product/roles-y-alcance.md` en el mismo commit.

## 4.3 — Comanda impresa en cocina

En México la cocina imprime. Sin esto compites contra papel y pierdes.

**El problema de arquitectura, dicho claro:** tu servidor está en la nube y la
impresora térmica está en la cocina, detrás del NAT del restaurante. El servidor
**no la ve**. Hay tres caminos y sólo uno es bueno:

| Camino | Veredicto |
|---|---|
| Imprimir desde el navegador con `@media print` | Sirve como respaldo del día 1, pero exige que alguien pulse un botón. La cocina no pulsa botones. |
| Servidor → impresora por internet | Requiere exponer la impresora. No. Nunca. |
| **Agente local que consume la cola** | **La correcta.** |

**Agente local:** un binario pequeño (Node empaquetado, o un contenedor en una
Raspberry Pi de $800 MXN en el propio local) que se autentica con un token de
dispositivo, consume el mismo canal de tiempo real que el tablero y manda ESC/POS
por TCP al puerto 9100 de la impresora. Reintenta si la impresora está sin papel,
y encola si se cae la conexión.

Modela el token: tabla `Device` (`businessId`, `name`, `tokenHash`, `kind:
PRINTER`, `lastSeenAt`). Así el dueño ve en el panel si la impresora de cocina
está viva, que es la pregunta que va a hacer.

**Contenido de la comanda:** folio grande, mesa, hora, comensales, y **sólo los
platillos con sus modificadores y notas** — sin precios. La comanda de cocina no
lleva dinero; el ticket del cliente sí, y es un formato distinto. Dos plantillas.

## 4.4 — Pantalla de cocina dedicada (KDS)

Tu propio `docs/product/roles-y-alcance.md` lo describe: *"pantalla fija en la
cocina, se loguea una vez y se queda meses, una sola cosa: los pedidos
entrantes, en letra grande, sin menús ni navegación"*. El tablero actual sirve
para el mesero con su celular; la cocina necesita otra cosa.

`/admin/cocina`: sin barra lateral, sin cabecera, tipografía enorme, columnas
Pendiente / Preparando / Listo, tarjetas con temporizador de antigüedad (el
componente `AgingIndicator` ya existe), aviso sonoro para pedido nuevo
(`lib/realtime/chime.ts` ya existe), y **un solo gesto por pedido**: avanzar.
Modo pantalla completa y bloqueo de suspensión (`WakeLock`).

## Criterio de terminado — Fase 4

- [ ] El reporte de un día cuadra al centavo contra la suma manual de los pedidos
      de ese día en la base (test de integración con datos sembrados).
- [ ] El CSV abre bien en Excel con acentos (BOM UTF-8) y sin desbordar celdas.
- [ ] No se puede cobrar en efectivo con la caja cerrada.
- [ ] Un corte con un retiro registrado da diferencia cero.
- [ ] El agente de impresión imprime una comanda en menos de 3 segundos desde
      que el pedido entra, y sobrevive a desconectar y reconectar la impresora.
- [ ] `/admin/cocina` se lee de pie a dos metros de la pantalla.

---

# Fase 5 — Completar el catálogo

**Objetivo.** Cerrar la brecha entre lo que el esquema soporta y lo que el
producto expone. Es la fase con mejor relación esfuerzo/resultado del plan:
buena parte del trabajo ya está hecha en la base de datos.

## 5.1 — Inventario (la lógica existe, la interfaz no)

Este es el hallazgo más llamativo de la auditoría. `createOrderFromCart` descuenta
stock de forma atómica, `cancelOrderAction` lo devuelve, `getPublicMenuRaw` oculta
lo agotado — todo correcto y probado por lectura. Y **no hay una sola pantalla
para activarlo**: `buildMenuItemSchema` no incluye `trackInventory` ni
`stockQuantity`, así que las columnas nunca cambian de su valor por defecto.

**(a)** Añadir ambos campos al esquema Zod, al `ItemEditorDrawer` y a las dos
acciones de crear/actualizar platillo.
**(b)** Columna de existencias en `ItemTable`, con ajuste rápido (+/−) sin abrir
el editor.
**(c)** Campo nuevo `MenuItem.minStockQuantity Int @default(0)` y un aviso en el
panel cuando se cruza hacia abajo.
**(d)** Bitácora, porque "¿por qué tengo 3 y debería tener 12?" es la pregunta que
sigue:

```prisma
/// Todo movimiento de existencias, con su causa. Sin esto, `stockQuantity` es
/// un número sin historia y nadie confía en él: un pedido lo baja, una
/// cancelación lo sube, un ajuste manual lo mueve, y sin bitácora las tres
/// cosas son indistinguibles.
model StockMovement {
  id          String @id @default(cuid())
  menuItemId  String
  /// Negativo al vender, positivo al reponer o al cancelar.
  delta       Int
  reason      StockMovementReason
  /// El pedido que lo causó, cuando aplica.
  orderId     String?
  createdById String?
  note        String?
  createdAt   DateTime @default(now())

  menuItem  MenuItem @relation(fields: [menuItemId], references: [id], onDelete: Cascade)
  order     Order?   @relation(fields: [orderId], references: [id], onDelete: SetNull)
  createdBy User?    @relation(fields: [createdById], references: [id], onDelete: SetNull)

  @@index([menuItemId, createdAt])
}

enum StockMovementReason { SALE CANCELLATION MANUAL_ADJUSTMENT RESTOCK WASTE }
```

La escritura del movimiento va **dentro de la misma transacción** que el cambio de
`stockQuantity`, en los tres sitios que hoy lo tocan. Es el mismo criterio del
outbox de notificaciones, aplicado a inventario.

**Alcance explícito de la v1:** esto es *inventario de platillos*, no de insumos.
Descontar 200 g de harina por pizza es un módulo distinto (recetas, escandallos,
unidades de medida, mermas) y **no** debe entrar aquí. Dilo en la documentación
comercial antes de que un cliente lo asuma.

## 5.2 — Promociones (el motor que falta)

`Promotion`, `PromotionTranslation`, `PromotionMenuItem` y `OrderPromotion` están
en el esquema, con reglas ricas: porcentaje, monto fijo, precio de combo,
`daysOfWeek`, ventana horaria, `usageLimit`, `perUserLimit`, `minOrderTotal`,
`maxDiscount`, `appliesToOrderType`. **`OrderPromotion` nunca se escribe**: hoy
ningún descuento se aplica jamás.

**(a) CRUD en `/admin/promociones`** (el ítem del sidebar ya existe con
`enabled: false`).

**(b) El motor**, en un módulo puro `lib/promotions/engine.ts` — con la misma
disciplina que `availability.ts`: sin Prisma, sin `Date.now()` dentro, recibe
todo por parámetro. Firma:

```ts
applyPromotions(input: {
  lines: OrderLine[];
  promotions: PromotionRule[];
  code?: string;
  orderType: OrderType;
  now: Date;
  timezone: string;
  usageByPromotion: Record<string, number>;
}): { discounts: AppliedDiscount[]; discountTotal: Decimal }
```

**(c) Enganche en `createOrderFromCart`**, dentro de la transacción que ya existe,
entre el cálculo del subtotal y el del impuesto. Decide y **documenta en el
esquema** el orden de operaciones: el descuento se aplica sobre el subtotal y el
impuesto se calcula sobre el subtotal ya descontado. Esa frase evita una
discusión con el contador del cliente dentro de un año.

**(d) `usageCount`** se incrementa con la misma técnica atómica del stock:
`updateMany` con `where: { usageLimit: null } OR { usageCount: { lt: usageLimit } }`.
Nunca leer-y-escribir.

**Esto es dinero: aplica la regla 5 del plan.** Sin tests de integración de cada
tipo de promoción, cada límite y cada combinación, no se mergea. Es el módulo con
más superficie de error de todo el sistema.

## 5.3 — Testimonios

Tabla lista, `ReviewStatus` con moderación lista, `Testimonial.orderId` para
reseñas verificadas listo. Falta la pantalla y falta que la landing los lea.

- `/admin/testimonios`: cola de pendientes, aprobar/rechazar, destacar, ordenar.
- Formulario público de reseña ligado a un pedido, enlazado desde el correo
  `order.delivered` de la fase 3. Una reseña que llega sola vale diez que pides
  a mano.
- Sólo `APPROVED` sale en la landing. Obvio, pero escríbelo en la query.

## 5.4 — La landing, 100 % desde la base

Hoy `components/marea-landing/content.ts` (337 líneas) sigue sirviendo ofertas,
testimonios, el texto de "acerca de" y los datos de contacto, aunque el menú ya
venga de la base. Es la última mentira del sistema: el panel promete que el dueño
edita su sitio, y la mitad de su sitio está en un archivo TypeScript.

- Ofertas ← `Promotion` con `isFeatured: true` (5.2).
- Testimonios ← `Testimonial` aprobados y destacados (5.3).
- "Acerca de", *tagline* y SEO ← `BusinessTranslation`, que ya tiene
  `aboutTitle`, `aboutBody`, `metaTitle` y `metaDescription`.
- Dirección, teléfono, correo y **horario real** ← `Business` y `OpeningHour`. Un
  horario desactualizado en el pie de página es una llamada perdida cada semana.
- `content.ts` se queda **sólo** con cadenas de interfaz (etiquetas de botones,
  encabezados de sección). Eso sí es contenido de código.

Además: metadatos por página con `generateMetadata`, JSON-LD de tipo `Restaurant`
con menú y horario —Google lo usa y sale gratis—, `sitemap.ts`, `robots.ts` y
Open Graph con una imagen real.

## 5.5 — Boletín

`NewsletterSubscriber` existe con `confirmedAt` y `unsubscribedAt`, o sea que ya
está modelado el doble opt-in. Con el worker de la fase 3 disponible, el
formulario del pie es media tarde: alta → correo de confirmación → clic → alta
confirmada, y un enlace de baja con token en cada envío. Sin baja funcional no
mandas nada: es lo que separa un boletín de un problema legal.

## Criterio de terminado — Fase 5

- [ ] Un platillo con `trackInventory` baja existencias al venderse, las repone
      al cancelarse, y cada movimiento aparece en la bitácora con su causa.
- [ ] Cada tipo de promoción tiene test de integración, incluidos los límites de
      uso bajo concurrencia.
- [ ] Un pedido con promoción guarda su `OrderPromotion` con el descuento
      congelado, y el ticket cuadra.
- [ ] `content.ts` no contiene ni un dato del negocio.
- [ ] La landing muestra el horario real y cambia al editarlo en el panel.
- [ ] Darse de baja del boletín funciona desde el enlace del correo.

---

# Fase 6 — Rendimiento y tiempo real de verdad

**Objetivo.** Que el sistema aguante el servicio de un viernes con varias
pantallas abiertas. La auditoría identificó que **lo primero que se cae no es la
base de datos: es el tablero de cocina**.

## 6.1 — Sustituir el polling por `LISTEN/NOTIFY`

Hoy `app/api/orders/stream/route.ts` consulta dos veces cada dos segundos por
cada cliente conectado: **3 600 consultas por hora y por pantalla**. Diez
pantallas son 36 000 consultas por hora sólo para preguntar "¿cambió algo?".

El comentario del archivo explica por qué se eligió así: `LISTEN/NOTIFY` no
sobrevive al pooler en modo transacción y Supabase Realtime no estaba disponible
en desarrollo local. **La fase 0 eliminó ambas restricciones.** Con Postgres
directo y un proceso largo, `LISTEN/NOTIFY` es la solución natural.

**Arquitectura:**

```
Postgres ──trigger AFTER INSERT en OrderStatusEvent──▶ pg_notify('marea_orders', payload)
                                                              │
                                              proceso con conexión dedicada
                                              (node-postgres, NO Prisma)
                                                              │
                                              multiplexor en memoria
                                                              │
                                    ┌─────────────┬────────────┴──────────┐
                                 SSE cocina    SSE caja        SSE cliente /o/<token>
```

**Detalles que importan:**

- La conexión de `LISTEN` es **dedicada y directa**: no puede salir del pool de
  Prisma ni pasar por un pooler en modo transacción. Es una conexión de
  `node-postgres` que no hace nada más.
- El *payload* de `pg_notify` está limitado a **8 000 bytes**. Manda sólo
  `{ businessId, orderId, toStatus }`; el cliente pide el detalle.
- **Reconexión:** si la conexión `LISTEN` se cae, el proceso vuelve a conectarse
  y —esto es lo importante— **hace un barrido de recuperación** de los eventos
  posteriores al último visto, porque las notificaciones perdidas durante la
  caída no se reenvían. Sin ese barrido, un pedido se pierde del tablero.
- **Respaldo:** si `LISTEN` no está disponible, degradar al polling actual con un
  intervalo largo (10 s). Que el sistema funcione peor es aceptable; que no
  funcione, no.

Los triggers: `AFTER INSERT` sobre `OrderStatusEvent` (que es inmutable, por eso
el esquema eligió escuchar ahí y no `UPDATE` sobre `Order`) y `AFTER UPDATE`
sobre `Payment`, en una migración escrita a mano como la de la `EXCLUDE`
constraint.

## 6.2 — Mandar el delta, no un `router.refresh()`

Hoy cada evento dispara `router.refresh()`: un cambio en la mesa 1 vuelve a
renderizar el tablero **completo** en el servidor, para todos, y `listBoardOrdersRaw`
no pagina — trae todos los pedidos vivos más 12 horas de entregados, con
`items`, `modifiers`, `payments` y `refunds`.

- El evento lleva el `orderId`; el cliente actualiza esa tarjeta y sólo esa.
- `router.refresh()` se conserva como **reconciliación** cada 60 segundos y al
  recuperar el foco de la pestaña, no como mecanismo principal.
- Actualización optimista al pulsar "avanzar": la tarjeta se mueve de columna de
  inmediato y revierte si la acción falla.

## 6.3 — Paginar el tablero

- Límite por columna (50 tarjetas) con "ver más". Una cocina con más de 50
  pendientes tiene un problema que no resuelve el scroll.
- "Entregados" y "Cancelados" pasan a carga bajo demanda: ya son pestañas
  separadas, aprovéchalo.
- El `select` sobre `payments` ya está afinado (el comentario del código lo
  explica); haz lo mismo con `items` y `modifiers`, que hoy traen columnas que la
  tarjeta no usa.

## 6.4 — Caché de lo público

La landing y el menú consultan Postgres en **cada visita**, sin `revalidate` ni
`unstable_cache`. El menú cambia dos veces por semana y se lee miles de veces al
día.

- `unstable_cache` con etiquetas (`menu:<businessId>`, `business:<slug>`) sobre
  `getPublicMenuRaw` y `getCurrentBusiness`.
- Invalidación con `revalidateTag` desde las acciones del panel que ya llaman a
  `revalidatePath`. Es añadir una línea a cada una.
- `getCurrentBusiness` además envuelto en `cache()` de React para deduplicar
  dentro de un mismo request — el mismo patrón que `lib/auth/session.ts` ya usa
  para la sesión.

## 6.5 — El folio deja de serializar los pedidos

`Business.orderSequence` se incrementa con un `UPDATE` dentro de la transacción de
cada pedido: **todos los pedidos del negocio bloquean la misma fila**. Con pedidos
simultáneos, esa fila es el cuello.

La opción que además le sirve al restaurante es un **folio diario**:

```prisma
/// Contador de folio por negocio y día. Sustituye a Business.orderSequence:
/// aquel serializaba todos los pedidos del negocio contra una sola fila, éste
/// reparte la contención por día y produce un folio que además dice algo
/// ("A-0142 del martes"), que es como el personal habla de los pedidos.
model OrderCounter {
  businessId String
  /// Fecha local del negocio, "YYYY-MM-DD".
  localDate  String
  lastNumber Int    @default(0)

  @@id([businessId, localDate])
}
```

Con `INSERT ... ON CONFLICT DO UPDATE SET "lastNumber" = "OrderCounter"."lastNumber" + 1
RETURNING "lastNumber"`, que es atómico en una sola sentencia. **Migración de
datos incluida**: los folios existentes no se tocan; el formato nuevo arranca en
la fecha de despliegue y se documenta el corte.

## 6.6 — Presupuesto de rendimiento del sitio público

- `next/image` en los tres `<img>` crudos que quedan (`ItemTable`, `MenuCard`,
  `TestimonialCard`), con los `remotePatterns` de la fase 0.3.
- Presupuesto explícito: **LCP < 2.5 s** y **CLS < 0.1** en 4G simulada, medido
  con Lighthouse en CI sobre la landing. Un número en el CI vale más que una
  intención en un documento.
- Revisar el peso de las dos familias de `next/font`: seis pesos entre
  Montserrat Alternates y Poppins es mucho para lo que la página usa.

## Criterio de terminado — Fase 6

- [ ] Con 10 pantallas conectadas durante una hora, las consultas a Postgres por
      tiempo real son **menos de 100** (hoy serían 36 000).
- [ ] Un cambio de estado aparece en las demás pantallas en menos de 1 segundo.
- [ ] Matar la conexión `LISTEN` y restaurarla: ningún pedido se pierde del
      tablero.
- [ ] Prueba de carga con 200 pedidos concurrentes: sin errores, sin folios
      duplicados, latencia p95 < 800 ms en el checkout.
- [ ] El menú público se sirve de caché y se invalida al editarlo en el panel.
- [ ] Lighthouse en CI cumple el presupuesto.

---

# Fase 7 — Multi-sucursal y multi-tenant

**Objetivo.** Poder vender al segundo cliente sin desplegar por segunda vez. Hoy
cada cliente es un despliegue con su propia variable `BUSINESS_SLUG`: eso no es
un producto, es una consultoría con costo marginal alto.

**La buena noticia:** el esquema está listo desde el día uno. `businessId` está
en toda tabla de negocio, y el comentario de cabecera de `schema.prisma` explica
que se puso ahí precisamente para que multi-tenant fuera "sólo agregar el filtro
/ RLS". El trabajo está en el runtime, no en la base.

## 7.1 — Resolver el negocio por petición

`getCurrentBusiness()` lee `process.env.BUSINESS_SLUG` y devuelve una fila fija.
Se llama en ~30 sitios. Sustitúyela por:

```ts
// lib/business.ts
export const getBusinessForRequest = cache(async (): Promise<Business> => {
  // 1. Panel: el negocio lo dice la sesión. El JWT ya lleva businessId y ya
  //    se revalida contra la membresía cada 60 s — la pieza más difícil de
  //    esto ya está construida.
  const session = await getSession();
  if (session?.user?.businessId) return byId(session.user.businessId);

  // 2. Público: subdominio o dominio propio.
  const host = (await headers()).get("host") ?? "";
  return bySlugOrDomain(host);
});
```

Y una columna nueva `Business.customDomain String? @unique`, porque el cliente que
paga el plan superior quiere `reservas.surestaurante.com`, no
`surestaurante.marea.app`.

**Cómo hacer este refactor sin romper nada:** marca `getCurrentBusiness` como
`@deprecated`, introduce la nueva, migra sitio por sitio en varios commits, y
**bórrala al final**. La matriz de permisos automatizada de la fase 1.3(d) es lo
que te avisa si alguna ruta se quedó atrás.

## 7.2 — Row Level Security (que es de Postgres, no de Supabase)

Es la red de seguridad equivalente a la `EXCLUDE constraint` de reservaciones:
que un bug de query **no pueda** cruzar datos entre restaurantes.

```sql
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order"
  USING ("businessId" = current_setting('app.business_id', true));
```

Y en la aplicación, fijar la variable al principio de cada transacción:

```ts
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.business_id', ${businessId}, true)`;
  // ...todo lo demás dentro de esta transacción queda acotado por la política
});
```

**Tres advertencias que hay que respetar o esto se vuelve contraproducente:**

1. `set_config` con el tercer parámetro en `true` es **local a la transacción**.
   Fuera de una transacción no sirve, y con un pool de conexiones sería peor que
   nada: heredarías el valor de otro tenant.
2. El usuario que usa la aplicación **no puede ser superusuario ni dueño de las
   tablas**: RLS no aplica sobre ellos. Crea un rol `marea_app` con permisos
   mínimos y usa ése en `DATABASE_URL`. Las migraciones siguen con el dueño.
3. RLS es **defensa en profundidad**, no sustituto del filtro. Sigue escribiendo
   `where: { businessId }` en las queries. La política es la que te salva del día
   que se te olvide.

Actualiza además el párrafo de RLS de `docs/DATABASE.md` §4: hoy lo atribuye a
Supabase, y es una característica de Postgres desde la versión 9.5.

## 7.3 — Cadenas: una organización por encima del negocio

Tres sucursales de la misma marca necesitan reportes consolidados y un dueño que
las administre todas — **sin** ser `SUPER_ADMIN` de la plataforma, que es tu rol
de operador y hoy es el único que está por encima de un negocio.

```prisma
model Organization {
  id        String     @id @default(cuid())
  name      String
  slug      String     @unique
  createdAt DateTime   @default(now())
  businesses Business[]
}
```

`Business.organizationId String?`, y un rol nuevo `ORG_ADMIN` en `UserRole`, por
debajo de `SUPER_ADMIN` y por encima de `BUSINESS_ADMIN`. `getEffectiveRole` ya
está aislado en su propio módulo justo para que este cambio sea local: es el
único sitio donde se decide un rol efectivo.

## 7.4 — Qué se comparte y qué no entre sucursales

Es una **decisión de producto** y hay que tomarla explícitamente, escrita en
`docs/product/`, antes de programarla:

| Entidad | Recomendación |
|---|---|
| Menú y categorías | Se heredan de la organización, con **sobreescritura de precio y disponibilidad** por sucursal. Es lo que hace toda cadena real. |
| Modificadores | Compartidos. |
| Mesas, pedidos, reservaciones, pagos, cortes | **Estrictamente por sucursal.** |
| Promociones | Ambas: alcance `ORGANIZATION` o `BUSINESS`. |
| Empleados | Un usuario, varias membresías. `BusinessMembership` ya lo soporta tal cual. |

La herencia de menú con sobreescritura es más trabajo del que parece. Si el
primer cliente de cadena no la pide, **empieza por menú independiente por
sucursal** y anótalo como limitación conocida.

## 7.5 — Particionado, cuando toque

`Order` particionada por rango de `placedAt` **sólo** al pasar del millón de
filas. Un restaurante con 300 pedidos diarios llega ahí en nueve años; una cadena
de veinte, en menos de dos. Criterio numérico, no intuición: cuando
`pg_relation_size('"Order"')` supere los 10 GB o el p95 de los reportes pase de
2 segundos.

## Criterio de terminado — Fase 7

- [ ] Dos negocios en la misma base, con sus dominios, sin fugas de datos.
- [ ] Test que intenta leer un pedido de otro negocio con una sesión válida y
      **falla por RLS**, con el filtro de la query desactivado a propósito.
- [ ] Un usuario con membresía en dos sucursales cambia entre ellas sin volver a
      autenticarse.
- [ ] `getCurrentBusiness` ya no existe en el código.
- [ ] `BUSINESS_SLUG` desaparece del `.env`.

---

# Fase 8 — De sistema a producto vendible

**Objetivo.** Lo que separa "tengo un software" de "tengo un negocio".

## 8.1 — Alta de clientes sin tu intervención

Un asistente de cuatro pasos: datos del negocio → horario → mesas (con la alta en
lote que ya existe) → primeros platillos. Más:

- **Importación de menú por CSV**, con vista previa y validación fila por fila.
  Es lo que convierte "dos días cargando el menú" en veinte minutos, y es el
  principal motivo por el que un restaurante abandona el alta a la mitad.
- Datos de ejemplo desechables para que el dueño vea el sistema lleno desde el
  primer minuto, con un botón claro de "borrar datos de ejemplo".
- Periodo de prueba con su fecha de fin visible.

## 8.2 — Facturación CFDI 4.0

En México es la segunda pregunta después del precio. **No timbres tú**: integra un
PAC (Facturama, SW Sapien, Finkok) por API.

**Alcance mínimo viable:** el cliente entra a `/o/<publicToken>`, pulsa
"Facturar", captura RFC, razón social, régimen fiscal y uso de CFDI, y recibe su
XML y su PDF. Nada de facturación global ni complementos de pago en la v1; eso es
otro proyecto.

Modela `Invoice` (uuid del SAT, serie, folio, XML, PDF, estado, `orderId`) y
guarda el XML: es el documento fiscal, el PDF sólo es su representación impresa.

## 8.3 — Cobrar tu propia suscripción

Stripe Billing sobre la misma cuenta que ya usas. Modela `Subscription` a nivel
de `Organization`, con planes y límites (número de sucursales, de usuarios, de
pedidos al mes), y un **degradado amable** al vencer: modo sólo lectura durante
15 días antes de suspender. Cortar el servicio de golpe en hora de comida a un
restaurante que se retrasó tres días con la tarjeta es como se pierde un cliente
para siempre.

## 8.4 — PWA offline para el mesero

El más caro de todo el plan, y por eso va al final. El WiFi de un restaurante se
cae; el pedido no puede caerse con él.

Service worker, cola local de mutaciones en IndexedDB, reconciliación al
reconectar, y resolución de conflictos con reglas explícitas (el estado del
pedido lo gana el servidor; las líneas nuevas se acumulan). El menú se cachea
completo al iniciar turno.

Constrúyelo cuando un cliente real lo pida. Antes de eso es especulación cara.

## 8.5 — Operación como servicio

- **Respaldos que sirven:** `pg_dump` cifrado a almacenamiento S3-compatible,
  diario, con retención 7/4/12 (días/semanas/meses) y **prueba de restauración
  mensual automatizada**. Un respaldo que nunca se restauró no es un respaldo.
- **Manual de operación** (`docs/RUNBOOK.md`): cómo desplegar, cómo revertir,
  cómo restaurar, qué hacer si el webhook de Stripe se atasca, cómo rotar el
  `AUTH_SECRET`, a quién llamar.
- **Página de estado** pública y monitor externo sobre `/api/health`.
- **Ventana de mantenimiento** y modo de sólo lectura para migraciones grandes:
  nunca a la hora de la comida.

## Criterio de terminado — Fase 8

- [ ] Un restaurante nuevo se da de alta y toma su primer pedido **sin que tú
      toques nada**.
- [ ] Un ticket se factura y el XML valida contra el esquema del SAT.
- [ ] Una restauración de respaldo probada, cronometrada y documentada.
- [ ] El manual de operación lo puede seguir alguien que no escribió el código.

---

# Apéndice A — Variables de entorno: antes y después

## Se eliminan

| Variable | Por qué |
|---|---|
| `DIRECT_URL` | Sólo existía por el pooler de Supabase. Pasa a **opcional**: si falta, `prisma.config.ts` usa `DATABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_URL` | Sustituida por el driver de almacenamiento |
| `SUPABASE_SERVICE_ROLE_KEY` | Ídem |
| `BUSINESS_SLUG` | Desaparece en la fase 7: el negocio se resuelve por sesión o por dominio |

## Quedan igual

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.

## Se añaden

| Variable | Fase | Por defecto | Para qué |
|---|---|---|---|
| `APP_ORIGIN` | 0 | `AUTH_URL` | Origen canónico. **Obligatoria en producción**: alimenta las URL de los QR impresos |
| `DATABASE_POOL_MAX` | 0 | `25` | Conexiones por proceso. Ver fórmula abajo |
| `STORAGE_DRIVER` | 0 | `local` | `local` \| `s3` |
| `STORAGE_LOCAL_DIR` | 0 | `./.data/media` | Ruta del volumen cuando el driver es `local` |
| `S3_ENDPOINT` | 0 | — | MinIO, R2, B2, AWS… cualquiera que hable S3 |
| `S3_REGION` | 0 | `auto` | |
| `S3_BUCKET` | 0 | — | |
| `S3_ACCESS_KEY_ID` | 0 | — | |
| `S3_SECRET_ACCESS_KEY` | 0 | — | |
| `MEDIA_PUBLIC_URL` | 0 | — | Base pública de las imágenes (CDN o dominio del bucket) |
| `MEDIA_HOSTNAME` | 0 | `localhost` | Para `images.remotePatterns` |
| `TRUSTED_PROXY_COUNT` | 0 | `1` | Proxies de confianza delante de la app. `0` si se expone directo |
| `SSE_MAX_LIFETIME_MS` | 0 | `75000` | `0` desactiva el corte, útil fuera de serverless |
| `MAILER_DRIVER` | 3 | `console` | `console` \| `smtp` \| `resend` |
| `SMTP_URL` | 3 | — | `smtp://usuario:clave@host:587` |
| `MAIL_FROM` | 3 | — | `Marea <hola@tudominio.com>` |
| `RESEND_API_KEY` | 3 | — | Sólo si `MAILER_DRIVER=resend` |
| `WORKER_POLL_MS` | 3 | `5000` | Ritmo del worker de notificaciones |
| `CRON_SECRET` | 3 | — | Protege `/api/cron/*` en despliegues serverless |
| `PRINTER_AGENT_TOKEN` | 4 | — | Token del agente de impresión local |
| `SENTRY_DSN` | 2 | — | Opcional pero recomendado desde la fase 2 |

**Fórmula del pool:** `DATABASE_POOL_MAX = (max_connections − 10) / (réplicas de la app + workers)`.
Con el `postgres:17` de Compose (`max_connections = 100`), una réplica y un
worker: `(100 − 10) / 2 = 45`. El valor por defecto de 25 deja margen para
`psql`, respaldos y Prisma Studio.

**Validación al arrancar.** Un módulo `lib/env.ts` con un esquema Zod que se
evalúa una sola vez y **rompe el arranque** si falta algo obligatorio en
producción. Hoy sólo `DATABASE_URL` se comprueba, y lo hace al primer uso: eso
significa que un despliegue mal configurado arranca "bien" y falla con la primera
visita.

---

# Apéndice B — Migraciones de esquema que introduce el plan

En orden. Cinco tablas nuevas, dos columnas y un enum: el esquema existente **no
se reescribe**.

| # | Fase | Migración | Qué añade |
|---|---|---|---|
| 1 | 2.1 | `add_password_changed_at` | `User.passwordChangedAt`; tabla `PasswordResetToken` |
| 2 | 2.4 | `add_rate_limit_counter` | Tabla `RateLimitCounter`; migra las filas de scope que hoy viven en `LoginAttempt` |
| 3 | 2.6 | `add_membership_event` | Tabla `MembershipEvent` |
| 4 | 4.2 | `add_cash_sessions` | Tablas `CashSession` y `CashMovement`, enum `CashMovementType`, `Payment.cashSessionId` |
| 5 | 5.1 | `add_stock_movements` | Tabla `StockMovement`, enum `StockMovementReason`, `MenuItem.minStockQuantity` |
| 6 | 6.1 | `add_realtime_triggers` | Triggers `pg_notify` sobre `OrderStatusEvent` y `Payment`. **Escrita a mano**, como la de la `EXCLUDE` |
| 7 | 6.5 | `add_order_counter` | Tabla `OrderCounter`; `Business.orderSequence` se conserva como histórico |
| 8 | 7.1 | `add_custom_domain` | `Business.customDomain` |
| 9 | 7.2 | `enable_rls` | Políticas RLS por tabla + rol `marea_app`. **Escrita a mano** |
| 10 | 7.3 | `add_organizations` | Tabla `Organization`, `Business.organizationId`, rol `ORG_ADMIN` |
| 11 | 8.2 | `add_invoices` | Tabla `Invoice` (CFDI) |

**Regla que ya vienes cumpliendo y no se rompe:** un cambio de esquema va en su
propio commit, junto con su migración y con nada más.

---

# Apéndice C — Dependencias nuevas y qué justifica cada una

| Paquete | Fase | Por qué se gana el sitio |
|---|---|---|
| `sharp` | 0 | Reprocesar imágenes: normaliza peso, borra EXIF, neutraliza payloads. Escribirlo a mano no es una opción |
| `@aws-sdk/client-s3` | 0 | El protocolo S3 es el estándar de facto: una dependencia, seis proveedores posibles |
| `@playwright/test` | 1 | (dev) Tres pruebas E2E |
| `@vitest/coverage-v8` | 1 | (dev) Umbral de cobertura en CI |
| `zxcvbn-ts` | 2 | Fuerza de contraseña. Reimplementarlo mal es peor que no tenerlo |
| `otpauth` | 2 | TOTP. Criptografía: nunca a mano |
| `nodemailer` | 3 | SMTP, que es lo que hace portable el envío |
| `react-email` | 3 | HTML de correo compatible con Outlook sin escribir tablas anidadas |
| `pg` | 6 | Conexión dedicada para `LISTEN/NOTIFY`, fuera del pool de Prisma |
| `@sentry/nextjs` | 2 | Opcional. Hoy la observabilidad son cuatro `console.error` |

**Diez paquetes para ocho fases.** Si alguna fase te empuja a añadir más, revisa
si no estás resolviendo un problema que no tienes.

---

# Apéndice D — Puerta de salida a producción

Checklist que se pasa **entera** antes de poner esto frente a un cliente que paga.
Un `no` es un bloqueo, no una nota al pie.

**Infraestructura**
- [ ] Despliegue reproducible desde cero, documentado y probado en una máquina limpia
- [ ] Migraciones automáticas y **reversibles** (plan de rollback escrito por migración)
- [ ] Respaldos diarios cifrados **con restauración probada**
- [ ] TLS con renovación automática
- [ ] `/api/health` monitoreado desde fuera, con alerta a un teléfono

**Seguridad**
- [ ] Las seis cabeceras presentes; CSP activa sin `unsafe-inline` en scripts
- [ ] Todas las cookies con `secure` en producción
- [ ] Todas las acciones públicas con límite de tasa
- [ ] MFA disponible para administradores
- [ ] Ningún secreto en el repositorio; `AUTH_SECRET` con ≥ 32 bytes aleatorios
- [ ] Contraseñas del seed **imposibles** de sembrar en producción
- [ ] Aviso de privacidad publicado y purga de datos corriendo

**Datos**
- [ ] Los reportes cuadran contra la suma manual, al centavo
- [ ] Los reembolsos se reflejan en el reporte del periodo correcto
- [ ] La `EXCLUDE constraint` verificada en el Postgres de producción
- [ ] Zona horaria del negocio correcta y probada **a través de un cambio de horario de verano**

**Operación**
- [ ] Manual de operación escrito y seguible por alguien que no escribió el código
- [ ] Alertas de: webhook fallido, cola de notificaciones atascada, base caída, error 5xx
- [ ] Impresora de cocina con estado visible en el panel
- [ ] Capacitación grabada: 20 minutos que respondan el 90 % de las dudas

**Producto**
- [ ] Un empleado nuevo aprende el tablero **sin manual**
- [ ] El dueño encuentra las ventas de ayer en menos de 15 segundos
- [ ] El sistema se puede usar entero desde un celular de gama media
- [ ] Modo degradado probado: qué pasa exactamente si se cae internet a media comida

---

# Apéndice E — Anti-objetivos

Cosas que **no** se hacen en este plan. Están aquí para que ninguna conversación
futura las reabra sin argumento nuevo.

- **No se reescribe el esquema.** Es lo mejor del proyecto. Se extiende.
- **No se cambia de ORM ni de framework.** Prisma 7 y Next 16 son decisiones
  tomadas y correctas. La deuda del proyecto no está ahí.
- **No se meten microservicios.** Un restaurante, o veinte, caben de sobra en un
  monolito con un worker. La complejidad distribuida se paga en operación diaria y
  aquí no compra nada.
- **No se adopta Supabase Realtime, Firebase ni ningún servicio de tiempo real.**
  `LISTEN/NOTIFY` sobre el Postgres que ya tienes resuelve el caso sin añadir un
  proveedor, y es portable.
- **No se construye inventario de insumos** (recetas, escandallos, mermas). Es un
  producto distinto. Dilo en la propuesta comercial antes de que el cliente lo
  asuma.
- **No se construye módulo de delivery propio** (rutas, repartidores, seguimiento
  en mapa). Compites contra plataformas con años de ventaja. El argumento de venta
  es *evitar su comisión en el pedido que ya es tuyo*, no sustituirlas.
- **No se añade IA todavía.** El esquema ya reservó las tres tablas comentadas y
  ahí se quedan hasta que haya clientes pagando y una pregunta concreta que
  responder.
- **No se mezcla refactor con comportamiento** en un mismo commit. Ya es tu
  regla; el plan la hereda.

---

# Apéndice F — De fase a prompt de módulo

Cada fase se convierte en uno o más documentos bajo `docs/prompts/`, continuando
la numeración de los seis existentes:

| Prompt | Fase | Rama sugerida |
|---|---|---|
| `07-postgres-y-deploy-portatil.md` | 0 | `feature/portable-deploy` |
| `08-documentacion-y-vault.md` | — | `feature/docs-generator` |
| `09-ci-y-pruebas.md` | 1 | `feature/test-harness` |
| `10-endurecimiento.md` | 2 | `feature/hardening` |
| `11-notificaciones.md` | 3 | `feature/notifications` |
| `12-reportes-y-corte-de-caja.md` | 4.1–4.2 | `feature/reports-and-cash` |
| `13-comanda-y-kds.md` | 4.3–4.4 | `feature/kitchen` |
| `14-inventario-y-promociones.md` | 5.1–5.2 | `feature/catalog-completion` |
| `15-landing-desde-la-base.md` | 5.3–5.5 | `feature/dynamic-landing` |
| `16-tiempo-real-y-rendimiento.md` | 6 | `feature/realtime` |
| `17-multi-sucursal.md` | 7 | `feature/multi-tenant` |
| `18-producto.md` | 8 | varias |

El `08` no corresponde a ninguna fase del plan: es mantenimiento del generador de
documentación, y está numerado ahí porque conviene hacerlo pronto — el cierre de
cada módulo ejecuta ese script. Puede correr antes o después del `07`; tocan
archivos disjuntos.

**Estructura de cada prompt**, la misma que ya funciona en los seis anteriores:
qué se construyó antes y qué quedó pendiente → cómo trabajar (enlazando a
`docs/CONVENCIONES.md`, con las comprobaciones que bloquean el arranque: sin
pull request abierto y con la rama anterior fusionada) → Fase 0 con los
hallazgos de la revisión anterior → fases numeradas con un commit por
preocupación → parada explícita al terminar la fase de diseño o de decisiones,
a esperar aprobación → cierre con grafo, notas de Obsidian y pull request →
criterio de terminado.

---

# Nota final

Este plan tiene 495–715 horas por delante y no hace falta comprometerse con
todas hoy. Lo que sí conviene decidir de una vez es el **orden**, porque el
orden es lo caro de equivocar: cada fase existe donde existe porque la anterior
le quita un obstáculo.

Si tuviera que defender una sola línea de todo el documento sería ésta: **haz las
fases 0 y 1 antes que cualquier otra cosa, aunque no sean las que se ven**. Un
sistema que no puedes desplegar donde quieras y que no puedes tocar sin miedo no
es un activo, por bien escrito que esté. Y este está muy bien escrito — que es
justamente lo que hace que valga la pena protegerlo.
