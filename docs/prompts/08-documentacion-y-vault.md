# Prompt para Claude Code — Módulo 8: el generador de documentación

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **No para a esperar aprobación**: no hay pantallas
> ni decisiones de producto, sólo un script que hoy hace daño despacio.
>
> Es independiente del módulo 7: tocan archivos disjuntos. Si el 7 todavía no
> ha corrido, **haz este primero** — su cierre ejecuta el generador y, sin
> estos arreglos, deja treinta notas basura en el vault.

---

`scripts/graphify-to-obsidian.mjs` tiene una idea correcta escrita en su propia
cabecera: *"una nota por archivo llena el vault de ruido que queda obsoleto en
cuanto tocas el código"*. Destilar el grafo a un puñado de notas por módulo es
lo que hay que hacer.

Y aun así el vault llegó a **64 notas donde la última corrida sólo produjo 36**.
No porque la idea esté mal, sino por tres defectos concretos que se acumulan
corrida tras corrida. Ya limpié el vault a mano una vez; este módulo hace que no
haga falta una segunda.

Lee antes de empezar: `docs/CONVENCIONES.md` (sección 9, que es la que define
qué se escribe en Obsidian y dónde) y la cabecera del propio script.

---

## Cómo trabajar

`docs/CONVENCIONES.md` manda. Las dos comprobaciones que bloquean el arranque,
igual que siempre:

```bash
gh pr list --state open                                        # tiene que estar vacío
git switch main && git pull
git log --oneline main..feature/<rama-anterior> | wc -l        # tiene que dar 0
```

Con las dos en verde:

```bash
git switch -c feature/docs-generator
git config core.hooksPath .githooks
```

Módulo pequeño: cuatro o cinco commits, todos `fix(docs)` o `feat(docs)`, y un
pull request al terminar. **No lo fusiones.**

Ejemplos de los commits que salen de aquí:

```
fix(docs): prune notes the run did not write
fix(docs): fail when graph analysis is missing
fix(docs): drop emoji from generated map title
feat(docs): add bitacora index to the map
```

---

## Fase 0 — Los tres defectos del generador

Cada uno su commit.

**0.1 — Escribe notas y no borra ninguna.** El script llama a `write()` por cada
módulo detectado y nunca mira qué había antes en `OUT_DIR`. Como nombra cada nota
por la firma de sus dos directorios dominantes —una firma que cambia en cuanto un
archivo se muda de carpeta— cada refactor deja atrás el juego completo de notas
anterior. En el vault convivían notas de al menos tres corridas distintas: lo
confirmé leyendo su frontmatter `commit`, que traía `424ee40`, `8a9df8c` y otro
más viejo.

El daño no es el espacio: es que **esas notas seguían enlazando a
`[[Grupo-1-Comida-Bebida]]`**, así que la nota de producto acumulaba 64 vínculos
entrantes de los cuales 28 apuntaban a módulos que ya no existen, y la vista de
grafo mostraba un sistema que no es el que hay.

El arreglo es de diez líneas y el material ya está ahí: `written` es el array de
rutas que esta corrida escribió. Al terminar, lee `OUT_DIR`, y borra los `.md`
que no estén en esa lista. **Con dos salvaguardas**, porque este código borra
archivos del vault de una persona:

- Sólo toca archivos cuyo nombre empiece por `Modulo-`, o que sean exactamente
  `00-Mapa-del-Codigo.md` o `Indice-de-Archivos.md`. Cualquier otra cosa que
  alguien haya dejado en esa carpeta se queda.
- Imprime qué va a borrar y cuántas son. Y acepta `--dry-run` para verlo sin
  borrar nada: la primera vez que se corre esto en un vault ajeno, uno quiere
  mirar antes.

**0.2 — Un análisis ausente produce un mapa que miente.** Si falta
`.graphify_analysis.json`, el script escribe `console.warn` y sigue con
`{ gods: [], surprises: [], cohesion: {} }`. El resultado es un mapa con las
secciones **"Funciones que todo el mundo llama"** y **"Conexiones que cruzan
módulos"** vacías. No dice "no pude calcularlo": dice, con una tabla en blanco,
que no hay ninguna. Y son justo las dos secciones que la fase de cierre de todos
los prompts manda revisar. En el vault llevan así al menos una corrida.

Elige uno de los dos y dime cuál:

- Salir con código distinto de cero y no escribir nada, o
- escribir el mapa poniendo en esas dos secciones una línea explícita de que el
  análisis no estaba disponible y cómo generarlo.

Me inclino por el segundo —el resto del mapa sí es útil— pero con la advertencia
bien visible, no en letra chica.

**0.3 — El único emoji del proyecto lo escribe este script.** Línea 281, en el
título del mapa, antes de "Mapa del código". Ya lo quité del vault a mano;
quítalo del generador o vuelve en la siguiente corrida. Ver la sección 8 de las
convenciones.

---

## Fase 1 — Que el mapa sea legible

Esto es criterio, no un defecto: **34 módulos no son módulos.**

Graphify detecta comunidades y el script las lista todas. Con 182 archivos salen
34, de las cuales quince tienen dos o tres archivos y varias comparten nombre
porque comparten directorios dominantes: hay un "components/admin + lib/i18n"
como módulo 6 y otro como módulo 34. Una tabla de 34 renglones donde seis dicen
casi lo mismo no es un mapa: es el mismo ruido que la cabecera del script dice
querer evitar, sólo que agrupado.

Dos cosas, y la segunda antes de escribir código:

**(a) `MODULE_NAMES` tiene cinco entradas y hacen falta más.** Su propio
comentario dice "agrega entradas conforme crezca el proyecto" y nadie lo hizo. Con
el mapa actual delante, nombra las comunidades grandes que hoy salen como
`dir + dir`: reservaciones, pagos, carrito, tablero, panel, landing, mesas.

**(b) Las comunidades diminutas.** Propón y **dime tu criterio** antes de
implementarlo: fusionarlas con la comunidad con la que más aristas comparten, o
listarlas juntas al pie del mapa bajo "módulos menores" sin nota propia. Yo
tiendo a lo segundo —fusionar inventa una estructura que el grafo no encontró—
pero quiero tu razón, no mi conclusión.

Lo que no cambia: el umbral que elijas va como constante nombrada arriba del
archivo, no como un número suelto a mitad de una función.

---

## Fase 2 — Enlazar la bitácora

`04-Proyectos-Verticales/Marea-Bitacora/` ya existe en el vault, con su
`00-Indice.md` y la plantilla. Es documentación funcional escrita a mano: qué
hace cada módulo entregado y por qué se decidió así. Nunca se sobrescribe.

El generador debe **enlazarla desde el mapa**, en una línea junto a los enlaces
que ya escribe a `[[Grupo-1-Comida-Bebida]]` y `[[Indice-de-Archivos]]`. Nada
más: el generador no escribe dentro de la bitácora ni la valida. Son dos mundos
y esa separación es justamente lo que hace que uno se pueda regenerar sin miedo.

Aprovecha para verificar que el banner de nota generada sigue siendo cierto
después de los cambios de la Fase 0: promete que lo de arriba de **Notas** se
sobrescribe. Ahora además hay archivos que desaparecen, y eso también toca
decirlo ahí.

---

## Fase 3 — Cierre

1. Corre el generador **dos veces seguidas** contra el vault real. La segunda
   corrida no debe borrar nada ni cambiar nada: si el script no es idempotente,
   aquí se ve.
2. Cuenta los `.md` de `Marea-Codigo/`: tienen que ser los módulos del mapa más
   dos. Hoy, tras la limpieza a mano, son 36.
3. Escribe la nota funcional de este módulo en
   `Marea-Bitacora/08-Generador-de-documentacion.md` y actualiza la tabla del
   índice. Es corta, pero es la primera de la bitácora y marca el tono.
4. Verificación de autoría:

```bash
git log main..HEAD --pretty="%an|%cn|%s|%b" \
  | grep -Ei "claude|copilot|chatgpt|co-authored|generated with|assisted"
```

5. Pull request contra `main`, con la plantilla. **Sin fusionar.**

---

## Reglas técnicas

Las de siempre en lo que apliquen. Cuatro de este módulo:

- **El script no es la aplicación.** Vive en `scripts/`, corre con `node` a mano,
  no importa nada de `lib/` ni de `app/`, y no necesita TypeScript. No lo
  conviertas en un módulo del proyecto.
- **Sin dependencias nuevas.** Hoy usa `node:fs` y `node:path` y con eso basta.
- **Borrar archivos ajenos exige salvaguardas.** Prefijo permitido, listado
  previo, `--dry-run`. Un script de documentación no puede ser lo que pierda
  trabajo de alguien.
- **Idempotencia.** Dos corridas seguidas sobre el mismo grafo dan el mismo
  resultado, sin borrados ni escrituras la segunda vez.

---

## Definición de terminado

- [ ] Una corrida tras mover archivos de sitio deja `Marea-Codigo/` sin notas
      huérfanas, y dice en consola cuáles borró.
- [ ] `--dry-run` lista lo que borraría sin tocar nada.
- [ ] El script se niega a borrar un archivo que no empiece por `Modulo-` ni sea
      uno de los dos índices. Pruébalo dejando un `mis-notas.md` en la carpeta.
- [ ] Sin `.graphify_analysis.json`, el mapa no sale con dos tablas vacías
      haciéndose pasar por un resultado.
- [ ] `grep -P` de emojis sobre el script y sobre las notas generadas devuelve
      cero.
- [ ] El mapa enlaza a la bitácora.
- [ ] Dos corridas seguidas no cambian nada.
- [ ] La nota `Marea-Bitacora/08-Generador-de-documentacion.md` existe y el
      índice la lista.
- [ ] Commits en formato semántico, ninguno pasa de 50 caracteres, y el grep de
      autoría devuelve vacío.
- [ ] Pull request abierto contra `main` y sin fusionar.

---

## Lo que NO debes hacer

- **No toques la aplicación.** Este módulo vive en `scripts/` y en documentación.
  Si acabas editando algo de `lib/` o `app/`, te saliste.
- **No escribas notas dentro de `Marea-Bitacora/`** desde el generador. Es a
  mano, a propósito.
- **No rellenes la bitácora hacia atrás** con los módulos 1 a 6. Se escribe la
  del módulo que se cierra.
- **No reescribas Graphify** ni cambies cómo detecta comunidades. Este script
  consume su salida; si la detección no te gusta, se discute aparte.
- **No añadas dependencias**, ni siquiera para el borrado o el argumento
  `--dry-run`.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase.
`/security-review` no aplica: aquí no hay superficie de ataque, hay un script
local que borra archivos con nombre conocido.

Avanza de corrido. La única parada es la pregunta de la Fase 1(b), que puedes
plantear y seguir trabajando en lo demás mientras respondo.
