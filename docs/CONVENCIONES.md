# Marea — convenciones de trabajo

Documento normativo. Rige git, commits, pull requests, comentarios y
documentación **desde el módulo 7 en adelante**. Todo prompt de
`docs/prompts/` lo da por leído y no repite sus reglas: si un prompt y este
documento se contradicen, manda este documento.

No reescribe historia: los 266 commits anteriores se quedan como están.

---

## 0. Idioma

**Todo lo que entra al historial de git o lo lee un revisor va en inglés:**
código, nombres de símbolos, comentarios, mensajes de commit, títulos y
descripciones de pull request, nombres de rama, y los documentos operativos del
repositorio que leería alguien ajeno (`README.md`, `AGENTS.md`,
`docs/DEPLOY.md`).

**Los documentos de trabajo propios siguen en español:** este archivo,
`docs/PLAN-PRODUCCION.md`, `docs/prompts/`, `docs/DATABASE.md`,
`docs/product/` y las notas del vault. Son material de planeación, no
entregables del repositorio.

No se retraducen los documentos en español que ya existen. Si algún día se
quieren en inglés, es un módulo aparte con su propia rama, no un cambio que se
cuela dentro de otro trabajo.

Esto coincide con el hábito que ya está escrito en el vault (`06-Ingles.md`):
README y comentarios en inglés, commits y pull requests en inglés. Un
repositorio que se enseña a un reclutador se lee entero en inglés o no se lee.

---

## 1. Autoría

**El autor y el committer de todo commit son siempre Filiberto Sañudo
`<filibertosanudo@gmail.com>`.** Hoy se cumple en el 100% del historial y en
este repositorio no existe un solo trailer de coautoría. Se mantiene así.

Antes de empezar, comprobar que el entorno está bien configurado:

```bash
git config user.name    # Filiberto Sañudo
git config user.email   # filibertosanudo@gmail.com
```

Si están vacíos, fijarlos en el repositorio antes del primer commit.

**Prohibido, sin excepciones:**

- Trailers `Co-Authored-By`, `Signed-off-by` de terceros, `Assisted-by` o
  equivalentes.
- Frases del tipo "generated with", "written with", "created using".
- El nombre de cualquier asistente o herramienta de IA.
- La opción `--author` para atribuir un commit a alguien más.

Aplica a **todo**: asuntos y cuerpos de commit, títulos y descripciones de pull
request, comentarios en el código, documentación, nombres de rama y notas de
Obsidian.

Verificación obligatoria antes de abrir el pull request:

```bash
git log main..HEAD --pretty="%an|%cn|%s|%b" \
  | grep -Ei "claude|copilot|chatgpt|co-authored|generated with|assisted"
```

Tiene que devolver vacío.

---

## 2. Ramas

Se conserva el prefijo `feature/` que ya usan las dieciséis ramas del
repositorio. Una rama por fase o por módulo, nunca compartida entre dos.

**Antes de crear la rama, dos comprobaciones que bloquean:**

```bash
# 1. No puede haber un pull request abierto. Si lo hay, se para y se avisa.
gh pr list --state open

# 2. La rama del módulo anterior tiene que estar fusionada en main.
git switch main && git pull
git log --oneline main..feature/<rama-anterior> | wc -l   # tiene que dar 0
```

Si `gh pr list` devuelve algo, **no se empieza un módulo nuevo**. Trabajar sobre
una base que todavía está en revisión produce conflictos que se resuelven a
ciegas y mezcla en un mismo diff cosas que se pidieron por separado.

La excepción, y la única, es la fase siguiente **del mismo módulo**: esa parte de
la rama de la fase anterior y su pull request apunta ahí, no a `main`. Ver la
sección 6.1.

Apertura, ya con las dos comprobaciones en verde:

```bash
git switch -c feature/<nombre-del-modulo>
git fetch --prune
git branch --merged main | grep -v '^\*\| main$' | xargs -r git branch -d
```

**Reglas de rama:**

- Nunca se commitea directamente a `main`.
- Nunca `--amend` ni force-push sobre algo ya subido.
- Se sube al cerrar cada fase, no sólo al final.
- Si `main` avanza durante el módulo, se integra con `git rebase main` **antes**
  de subir, nunca después.

---

## 3. Commits

Formato semántico, según las buenas prácticas de
[midu.dev](https://midu.dev/buenas-practicas-escribir-commits-git/):

```
<tipo>(<ámbito>): <descripción>
```

| Regla | Detalle |
|---|---|
| Longitud | **Máximo 50 caracteres**, contando el prefijo |
| Modo | Imperativo presente: `add`, `fix`, `remove`, `move`. Nunca `added` ni `adds` |
| Puntuación | Sin punto final, sin puntos suspensivos |
| Mayúsculas | Todo en minúscula después de los dos puntos |
| Idioma | Inglés, como los 266 commits anteriores |
| Ámbito | Opcional, en minúscula, entre paréntesis |

La prueba del imperativo: el asunto tiene que completar la frase *"si aplico
este commit, entonces este commit \_\_\_"*.

**Tipos**

| Tipo | Cuándo |
|---|---|
| `feat` | Funcionalidad nueva visible para alguien |
| `fix` | Corrección de un comportamiento incorrecto |
| `refactor` | Cambio de estructura sin cambio de comportamiento |
| `perf` | Mejora de rendimiento |
| `docs` | Documentación, dentro o fuera del código |
| `test` | Pruebas |
| `build` | Empaquetado, Dockerfile, dependencias |
| `ci` | Integración continua |
| `style` | Formato que no toca comportamiento |
| `chore` | Mantenimiento que no encaja arriba |

**Ámbitos** del dominio de este repositorio: `menu`, `orders`, `payments`,
`reservations`, `tables`, `cart`, `auth`, `admin`, `landing`, `storage`,
`deploy`, `db`, `i18n`, `realtime`.

**Ejemplos correctos**

```
feat(tables): add printable qr sheet
fix(reservations): scope rate-limit cleanup
refactor(storage): extract driver interface
build(deploy): add multi-stage dockerfile
docs(deploy): document nginx real ip setup
chore: drop supabase env vars
```

**Ejemplos incorrectos**

```
Add the printable QR sheet for tables          falta el tipo, va en mayúscula
feat(tables): added printable qr sheet         pasado en vez de imperativo
feat(tables): add printable qr sheet.          punto final
feat: add qr sheet and fix the rate limit      dos preocupaciones, y pasa de 50
fix: arreglar el límite de tasa                idioma inconsistente
```

**Si el asunto no cabe en 50 caracteres, el commit está haciendo demasiado.**
Ese es el punto de la regla, no un obstáculo a rodear con abreviaturas.

**Cuerpo del commit.** Sólo cuando el *porqué* no se deduce del diff. Máximo
tres líneas, con puntuación normal, separado del asunto por una línea en
blanco. Se escribe con `git commit` sin `-m`, o con dos `-m`:

```bash
git commit -m "fix(auth): trust proxy count for client ip" \
           -m "Taking the first x-forwarded-for value only works behind a proxy that rewrites the header."
```

---

## 4. Granularidad: un commit por función o por pantalla

**El criterio es la reversibilidad.** Si `git revert <sha>` deja el sistema
coherente y sin restos, el corte está bien. Si para deshacer una sola cosa hay
que revertir tres commits en orden, estaban mal cortados.

De eso se derivan las reglas duras:

- **Nunca refactor mezclado con comportamiento** en el mismo commit.
- **Un cambio de esquema va solo**, con su migración y con nada más.
- **Un hallazgo, un commit.** Las fases 0 de los prompts se cierran así.
- Techo orientativo: ~400 líneas u 8 archivos.

**Orden recomendado para una pantalla nueva**, un commit por renglón:

1. `feat(db): ...` — esquema y migración, si aplica
2. `feat(<ámbito>): add schemas and queries` — Zod y consultas
3. `feat(<ámbito>): add server actions` — mutaciones con `requireRole`
4. `feat(<ámbito>): add <componente>` — componentes, uno por commit si son grandes
5. `feat(admin): add <pantalla> screen` — la página que los une
6. `feat(i18n): add <ámbito> dictionary` — cadenas
7. `test(<ámbito>): cover <caso>` — pruebas

Así, revertir la pantalla no revierte las acciones, y revertir una acción no
tumba el esquema.

---

## 5. Validación automática

Un hook versionado, sin dependencias nuevas. Se activa una sola vez por clon:

```bash
git config core.hooksPath .githooks
```

`.githooks/commit-msg` valida formato, longitud, puntuación final, ausencia de
emojis y ausencia de menciones a herramientas. Rechaza el commit antes de que
llegue al historial, que es donde ya no se puede arreglar sin reescribirlo.

No se añaden `husky`, `commitlint` ni `commitizen`: quince líneas de shell
hacen lo mismo sin tres dependencias y sin un paso de instalación.

---

## 6. Pull request

Referencia: [The Perfect Pull Request](https://www.deployhq.com/blog/the-perfect-pull-request-best-practices-for-collaborative-development).

### 6.1 Tamaño: es la regla que decide todas las demás

La eficacia de una revisión se desploma pasadas las 200-400 líneas de cambio.
No es opinión, es lo que mide la industria:

| Tamaño del cambio | Calidad de la revisión | Tiempo real de revisión |
|---|---|---|
| 1-100 líneas | Alta | 15-30 min |
| 100-300 líneas | Buena | 30-60 min |
| 300-500 líneas | Cae en picada | 1-3 h |
| 500+ líneas | Nula en la práctica | Días, y suele quedarse sin revisar |

**Techo: 400 líneas por pull request.**

Eso choca de frente con "un pull request por módulo": el módulo 7 fueron 52
commits y varios miles de líneas. Un pull request así no se revisa, se aprueba
por cansancio. Así que la regla real es:

> **Un pull request por fase, no por módulo.**

Las fases de cada prompt ya están cortadas por tema —hallazgos, decisiones,
almacenamiento, empaquetado, documentación— que es exactamente el corte que
hace revisable un diff.

**Fases encadenadas (stacked).** Cada fase parte de la rama de la anterior, no
de `main`, y su pull request apunta a esa misma rama. Cuando la primera se
fusiona, GitHub reapunta la siguiente a `main` sola:

```bash
git switch -c feature/ci-fase-0 main
# fase 0, pull request contra main

git switch -c feature/ci-fase-1 feature/ci-fase-0
# fase 1, pull request contra feature/ci-fase-0
```

**Matiz a la regla de la sección 2.** "No se empieza con un pull request
abierto" aplica a **empezar un módulo nuevo**, no a la fase siguiente del mismo
módulo: para eso están las ramas encadenadas. Un módulo no arranca hasta que el
anterior está fusionado entero.

Si una fase se pasa de 400 líneas y no se puede partir sin dejar el sistema a
medias, dilo en la descripción y explica por qué. Una excepción argumentada está
bien; que sea la norma, no.

### 6.2 Título

Una línea que diga **qué cambió y por qué**, en inglés, imperativo, sin punto
final. Sin prefijo semántico obligatorio: describe la fase, no el último commit.

```
Correcto:   Add integration test harness with an ephemeral Postgres schema
Correcto:   Fix race condition in session cleanup that caused 502s under load
Incorrecto: Fase 1
Incorrecto: Fix bug
Incorrecto: Update code
```

### 6.3 Descripción

Responde tres preguntas antes de que el revisor abra un solo archivo: **qué
cambió**, **por qué**, y **por dónde empezar a leer**. La plantilla de
`.github/pull_request_template.md` ya tiene esa forma; se llena entera.

Lo que no puede faltar:

- **La causa raíz**, si es un arreglo. "Arregla el login" no dice nada; "el
  token no se revalidaba porque el callback salía antes de tiempo" sí.
- **Cómo revisar**: por dónde empezar, qué archivo es el cambio de verdad, qué
  se puede saltar (movimientos de archivos, reformateos).
- **Capturas o video** si hay cambio visible, con antes y después.
- **Notas de despliegue**: variables nuevas, migraciones, si es seguro
  desplegarlo en horario de servicio.
- **Renglón propio** si la fase tocó dinero, seguridad o esquema.

### 6.4 Antes de pedir revisión

Revísate a ti mismo primero, leyendo el diff en GitHub y no en el editor: el
cambio se ve distinto ahí y la mitad de los descuidos saltan solos.

- CI en verde. Un pull request rojo no se manda a revisar.
- Sin `console.log` de depuración, sin código comentado, sin archivos sueltos.
- Sin secretos, claves ni `.env` en el diff.
- Los comentarios que anticipan la pregunta obvia, escritos **en el código**, no
  en el hilo del pull request. Lo que se explica en un comentario de GitHub se
  pierde; lo que se explica en el código se queda.
- Si aún no está listo pero quieres enseñarlo, **draft**. Un borrador marcado
  como borrador no gasta el tiempo de nadie.

### 6.5 Responder comentarios

Prefijos para que la intención no se malinterprete, en cualquier dirección:

| Prefijo | Significa |
|---|---|
| `blocking:` | Hay que arreglarlo antes de fusionar |
| `question:` | Quiero entender, no pido cambio |
| `suggestion:` | Tómalo o déjalo |
| `nit:` | Detalle menor, opcional |

Todo comentario se responde: se aplica, o se explica por qué no. Un hilo sin
respuesta bloquea la fusión igual que un `blocking:`. Cuando se aplica un
cambio, se contesta con el enlace al commit, no con "listo".

### 6.6 Fusión

**No se fusiona solo.** El pull request se abre y ahí termina el trabajo del
módulo o la fase: lo revisa Filiberto.

```bash
git push -u origin feature/<rama>
gh pr create --base <rama-base> --title "<título>" --body-file <archivo>
```

### 6.7 Anti-patrones

- **Mega pull request:** miles de líneas y tres temas distintos. Se parte.
- **Aprobación de trámite:** "LGTM" a los dos minutos de un diff de 900 líneas.
- **Revisión de detalles:** cuarenta comentarios sobre nombres y ninguno sobre
  la lógica. El estilo lo arregla el linter.
- **Pull request fantasma:** abierto tres semanas, cuarenta comentarios, sin
  fusionar. Si se atoró, se cierra y se replantea.
- **Refactor mezclado con funcionalidad:** ya es regla de commits (sección 4);
  a nivel de pull request es lo mismo y se nota más.

## 7. Comentarios en el código

Cortos y concisos, como los commits.

- **Tres líneas por defecto**, ocho como máximo absoluto, y sólo cuando
  documentan una decisión de arquitectura que alguien va a consultar.
- **Explican el porqué, nunca el qué.** Si el comentario parafrasea el código,
  sobra: se arregla el nombre, no se añade el comentario.
- Se comenta lo que sorprende: la decisión no obvia, la alternativa descartada,
  la restricción externa, la trampa que costó una tarde.
- **Idioma: inglés**, sin excepciones, incluidos los comentarios de
  `prisma/schema.prisma`. Ver la sección 0.
- Nada de comentarios de sección decorativos, ni `// TODO` sin fecha ni dueño.
  Hoy el repositorio tiene cero `TODO`; que siga así.

**Los comentarios largos que ya existen no se recortan.** Los bloques de
`availability.ts`, `create-order.ts`, `stripe-actions.ts` y el encabezado del
esquema explican decisiones que costaron trabajo y son parte del valor del
proyecto. Esta regla aplica a lo que se escriba de aquí en adelante.

---

## 8. Sin emojis

Ni en commits, ni en pull requests, ni en el código, ni en comentarios, ni en la
interfaz, ni en la documentación del repositorio, ni en nombres de rama.

Los iconos de la interfaz son SVG (`components/admin/icons.tsx`,
`components/marea-landing/icons.tsx`), que es lo correcto: escalan, heredan
`currentColor` y se ven igual en todos los sistemas.

Para señalar estado en documentos se usan palabras o marcas de texto: `[x]`,
`[ ]`, "correcto", "pendiente", "bloqueado".

**El vault de Obsidian queda fuera de esta regla.** Es un espacio personal y ya
usa emojis a propósito en `Inicio.md`, en `00-Resumen.md` y en el título que
genera el propio `graphify-to-obsidian.mjs`. La regla aplica a lo que se
**escribe a mano en las notas nuevas de la bitácora**, que se leen como
documentación técnica; no a lo que ya existe ni a las notas generadas.

---

## 9. Documentación en Obsidian

El vault ya tiene una estructura y estas reglas se acomodan a ella, no al revés.

**Lo que ya existe**

| Nota | Qué es | Quién la escribe |
|---|---|---|
| `04-Proyectos-Verticales/Grupo-1-Comida-Bebida.md` | La nota de producto de Marea: alcance, checklist de "debe incluir", enlaces al repo. Su `estado` alimenta la tabla Dataview de `00-Resumen.md` y su checklist alimenta `Pendientes.md` | A mano |
| `04-Proyectos-Verticales/Marea-Codigo/` | Mapa del código y una nota por módulo detectado. Se **sobrescribe entera** en cada corrida de `scripts/graphify-to-obsidian.mjs` | Generada |
| `04-Proyectos-Verticales/Marea-Bitacora/` | Una nota funcional por módulo entregado. Nunca se sobrescribe | A mano |

**Al cerrar cada módulo, tres escrituras al vault.**

**(a) Regenerar el grafo.**

```bash
graphify
node scripts/graphify-to-obsidian.mjs --out "<vault>/04-Proyectos-Verticales/Marea-Codigo"
```

Comprobar que `.graphify_analysis.json` se generó: si falta, el script avisa y
sigue, y el mapa sale con las secciones "Funciones que todo el mundo llama" y
"Conexiones que cruzan módulos" **vacías**, que son justo las dos que se revisan
en el cierre.

**(b) La nota funcional del módulo**, en
`04-Proyectos-Verticales/Marea-Bitacora/NN-nombre-corto.md`, con la plantilla
que documenta `Marea-Bitacora/00-Indice.md`: qué hace ahora el sistema que antes
no, decisiones con su alternativa descartada, cómo se prueba, límites conocidos,
variables o comandos nuevos, enlaces.

El nombre sigue la convención del vault (`NN-Nombre-Con-Guiones`) y **no** lleva
el prefijo `Modulo-`: ese lo usan las notas generadas de `Marea-Codigo/` y
repetirlo obligaría a escribir rutas completas en cada enlace.

Actualizar también la tabla de módulos de `Marea-Bitacora/00-Indice.md`.

**(c) Poner al día la nota de producto**, `Grupo-1-Comida-Bebida.md`: marcar en
"Debe incluir" lo que el módulo terminó y ajustar la nota en cursiva de lo que
quedó a medias. Esa checklist es la que aparece en `Pendientes.md`, así que una
casilla desactualizada no es un detalle cosmético: es una tarea fantasma en el
tablero personal.

**Lo que no se hace**

- No se escriben notas funcionales dentro de `Marea-Codigo/`. Todo lo que esté
  fuera de las marcas `notas:inicio` / `notas:fin` se pierde en la siguiente
  corrida, y los nombres de esas notas cambian solos cuando el código se mueve
  de directorio.
- No se rellena la bitácora hacia atrás. Los módulos 1 a 6 se entregaron antes
  de que existiera; se escribe el del módulo que se cierra.
- No se mencionan herramientas de IA en el vault, igual que en el repositorio.

---

## 10. Integración continua y protección de rama

`.github/workflows/ci.yml` corre en cada pull request y en cada push a `main`,
con cuatro jobs:

| Job | Qué hace | ¿Bloquea la fusión? |
|---|---|---|
| `check` | `tsc --noEmit`, `eslint`, `npm run test:unit` — sin base de datos | Sí |
| `integration` | Levanta un servicio `postgres:17`, aplica migraciones y corre `npm run test:integration` | Sí |
| `commits` | Valida cada mensaje de commit del pull request con `scripts/validate-commit-msg.sh` | Sí |
| `pr-size` | Avisa si el diff pasa de ~400 líneas — nunca falla | No |

**Configuración manual en GitHub** (Settings → Branches → Branch protection
rules, regla sobre `main`), porque esto no se puede hacer desde el repositorio:

- **Require a pull request before merging.**
- **Require status checks to pass before merging**, y marcar como obligatorios:
  `check`, `integration`, `commits`. **No** marcar `pr-size`: es un aviso, no
  una puerta, y CI lo deja siempre en verde a propósito.
- **Require branches to be up to date before merging.**
- **Do not allow bypassing the above settings** (incluido para
  administradores, salvo que una emergencia real lo justifique).

Un clon sin `git config core.hooksPath .githooks` activado no tiene el hook
local, pero el job `commits` corre la misma validación
(`scripts/validate-commit-msg.sh`, la única fuente de verdad — el hook es un
wrapper de una línea sobre el mismo script) del lado del servidor, así que un
commit mal formado no llega a fusionarse aunque el clon nunca haya activado el
hook.
