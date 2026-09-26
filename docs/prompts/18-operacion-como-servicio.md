# Prompt para Claude Code — Módulo 18: operación como servicio

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **Para al final de la Fase 1** con las respuestas de
> alcance.

---

El módulo 17b quitó la última razón técnica para no aceptar un restaurante
ajeno: cada negocio cobra en su propia cuenta y la plataforma ya no retiene
dinero de nadie. Quedan dos verificaciones a mano (registrar los dos webhooks y
un alta completa con una cuenta activada), y son del dueño, no tuyas.

Este módulo resuelve la razón que queda, y no es técnica sino de oficio: **hoy
no existe ningún respaldo.** Ni uno. La base vive en el volumen `pgdata` de
`docker-compose.yml` y las fotos del menú en el volumen `media`, porque el
despliegue recomendado usa `STORAGE_DRIVER: local`. Si el disco de ese servidor
se pierde, se pierden los pedidos, las reservaciones, los cortes de caja y el
menú de cada restaurante que confió en el sistema, y no hay forma de
recuperarlos.

Mientras el único restaurante era el del dueño, eso era un riesgo propio. Con un
restaurante ajeno es otra cosa: estás guardando sus datos, y perderlos es el
tipo de fallo del que un negocio pequeño no se recupera y del que tú tampoco.
**Por eso este módulo va antes que el alta autoservicio, la suscripción y la
factura electrónica, aunque ninguno de esos pueda venderse sin los otros.** Un
restaurante se puede dar de alta a mano con `npm run tenants`; un respaldo que no
existe no se puede tomar a mano después del incendio.

La fase 8 del plan se dividió en tres módulos por esto mismo (ver la fila de
estado y el Apéndice F de `docs/PLAN-PRODUCCION.md`):

- **18 — operación como servicio** (este): respaldos, restauración probada,
  tareas programadas, monitoreo, modo de sólo lectura y manual de operación.
- **19 — alta autoservicio y suscripción**: el asistente, la importación de menú
  por CSV, el periodo de prueba y el cobro de tu propia suscripción.
- **20 — factura electrónica CFDI 4.0** con un PAC.

La PWA sin conexión (8.4) queda pospuesta: el propio plan dice construirla
cuando un cliente real la pida.

Lee antes de empezar: `docs/DEPLOY.md` completo, `docker-compose.yml`,
`app/api/health/route.ts`, `scripts/worker.ts`, los cuatro scripts de
mantenimiento en `scripts/`, `scripts/provision-db-roles.ts`, la cabecera de la
migración `20260925000000_enable_row_level_security`,
`docs/aviso-de-privacidad.md`, `docs/CONVENCIONES.md`, `AGENTS.md` y
`docs/PLAN-PRODUCCION.md` §8.5.

---

## Cómo trabajar

Como siempre: **todo en inglés** salvo los documentos de planeación, **un pull
request por fase** con ramas encadenadas, autoría exclusivamente tuya, cero
emojis, y `git diff --stat main..HEAD` antes de abrir cada pull request.

```bash
gh pr list --state open
git switch main && git pull
git switch -c feature/ops-fase-0 main
```

`docs/PLAN-PRODUCCION.md` y este prompt tienen cambios sin versionar (la fila 7b
todavía decía "sin fusionar", y la fase 8 se dividió). Entran en el primer
commit de la Fase 0: `docs(plan): split phase 8 into three modules`.

**El criterio de este módulo:** un respaldo que nunca se restauró no es un
respaldo, es una esperanza. Nada de lo que construyas aquí cuenta como hecho
hasta que una restauración desde cero, en una máquina que no es la de
producción, lo haya demostrado.

---

## Fase 0 — Verificar el terreno (sin escribir código, salvo el commit del plan)

Seis hechos. Los cinco primeros los encontré leyendo el repositorio; confírmalos
o corrígelos. El sexto es una investigación.

**1. Dos volúmenes, no uno.** `pgdata` y `media`. Con el driver local, un
`pg_dump` restaurado sin su carpeta de medios da un menú cuyas fotos apuntan a
archivos que no existen. Con el driver S3 la situación es otra, y hay que
decidir si el respaldo cubre también el bucket o si se confía en el versionado
del proveedor. Di qué despliegues posibles existen hoy según `lib/env.ts` y
`docs/DEPLOY.md`, y qué necesita cada uno.

**2. Los roles no viajan en el dump.** `marea_app` y `marea_worker` son roles del
clúster, no de la base, así que un `pg_dump` de la base lleva los `GRANT`, las
políticas de RLS y las funciones `SECURITY DEFINER` que los nombran, pero no los
roles. Restaurar en un clúster vacío sin haber corrido antes
`db:provision-roles` debería fallar en los `GRANT` o dejar una base que la
aplicación no puede usar, y el arranque la rechaza (`DATABASE_ROLE_CHECK`).
Además, el dump tiene que correr como dueño de las tablas: entiendo que
`pg_dump` desactiva `row_security` por omisión y **falla** si el rol no puede
saltarse RLS, en vez de sacar un dump filtrado en silencio. **Verifica las dos
cosas en un Postgres 17 real**, no en la documentación: el orden exacto de una
restauración que funciona, y qué hace `pg_dump` cuando lo corre `marea_app`.

**3. El aviso de privacidad promete cosas que nadie ejecuta.**
`docs/aviso-de-privacidad.md` dice que los datos de IP se eliminan a los 90 días
y que el contacto de pedidos y reservaciones se anonimiza a los 24 meses.
`scripts/purge-old-ip-data.ts` se describe a sí mismo como seguro de programar,
y nada lo programa. Lo mismo `rate-limits:purge` y `storage:sweep`.
`privacy:anonymize-guests` es manual a propósito (su comentario explica por qué,
y el razonamiento es bueno), pero una decisión que nadie toma rompe la promesa
igual que un script que nadie corre. Confirma qué corre hoy de forma
programada en un despliegue con Compose. Mi lectura: nada.

**4. `/api/health` sólo mira la base.** Si el worker se cae, la cola de
notificaciones crece, los correos de confirmación dejan de salir, y el monitor
sigue viendo 200. Di qué señales existen hoy para saber que el worker está vivo
y que la cola avanza, y cuáles faltan.

**5. `AUTH_SECRET` sólo lo usa Auth.js, y el worker lo tiene igual.** Busqué
en `lib/`, `app/`, `scripts/` y `auth.ts`: la única referencia explícita es la
validación de `lib/env.ts`, que lo exige. Los tokens de restablecimiento, de
dispositivo y del carrito son aleatorios con hash, no firmados con él. Eso
significa dos cosas que quiero confirmadas: rotarlo invalida las sesiones (todas
a la vez, y con sesiones de 8 horas el costo es que todos vuelven a entrar) y
nada más; y el worker recibe en `docker-compose.yml` un secreto que no usa,
probablemente sólo para pasar la validación del entorno. Un proceso que no
autentica a nadie no debería tener la llave de las sesiones. Verifica además si
Auth.js v5 admite rotar con más de un secreto a la vez; no lo supongas.

**6. La prueba de promociones que falló en la CI de #92.** `promotion_exhausted`
salió como excepción en una prueba que el módulo 17b no tocó, pasó al
reintentar, y quedó sin explicación. Una pista: el comentario de
`lib/orders/create-order.promotions.integration.test.ts` (alrededor de la línea
370) dice que *"`business.update`'s row lock earlier in checkout fully
serializes the two"*, y desde el módulo 16 `create-order.ts` ya no hace ningún
`business.update`: el folio vive en `OrderCounter`. Si la premisa del comentario
ya no es cierta, la serialización que esas pruebas daban por hecha depende ahora
de otro candado, en otro punto del flujo, o de ninguno.

Busca el log de esa corrida de CI, di qué prueba exacta falló, y decide cuál de
dos cosas es:

- **Una carrera del arnés de pruebas.** Entonces se corrige la prueba y el
  comentario, con una explicación de por qué la corrección es determinista.
- **Un fallo real.** Una promoción *automática* que aborta un pedido en vez de
  descartarse es exactamente el caso que el comentario de `create-order.ts`
  describe como el error que no se debe cometer: el comensal reintenta un pedido
  que nunca va a pasar. Entonces se corrige el código, con una prueba que lo
  reproduzca de forma determinista.

**Lo que no vale:** reintentar la CI hasta que salga verde, marcar la prueba como
inestable, o subir un timeout. La CI es la red de seguridad de todo el plan, y
una prueba que falla una vez de cada tantas enseña a ignorar la CI.

Si la corrección es de código, va en su propio pull request antes de la Fase 2,
con su propia rama desde `main`. No la mezcles con los respaldos.

---

## Fase 1 — Decisiones de alcance (para y espera respuesta)

Siete preguntas. Trae tu recomendación razonada para cada una y **para**.

### 1. Dónde viven los respaldos y quién puede borrarlos

Un respaldo en el mismo disco que la base no protege de perder el disco. Un
respaldo que la aplicación puede borrar no protege de que alguien comprometa la
aplicación. Las dos cosas son requisitos, no preferencias.

Propón: el destino (almacenamiento compatible con S3, de otro proveedor o al
menos de otra cuenta que el de los medios), las credenciales (separadas de las
de la aplicación, que sólo puedan escribir y no borrar ni sobrescribir), qué
mecanismo del proveedor lo garantiza (versionado, bloqueo de objetos, política
de ciclo de vida), el cifrado (herramienta y dónde vive la llave: **no en el
mismo servidor**), y la retención. El plan dice 7/4/12 (días, semanas, meses);
di si la sostienes y cuánto cuesta en almacenamiento con el tamaño actual de la
base de desarrollo, extrapolado.

### 2. Cuánto se puede perder

Un `pg_dump` diario significa que, en el peor caso, se pierde casi un día de
pedidos, cortes de caja y reservaciones. Para un restaurante, perder los cobros
en efectivo de un día es perder el corte. La alternativa es archivar el WAL
(pgBackRest, WAL-G) para restaurar a cualquier punto en el tiempo, a cambio de
más piezas, más configuración y una restauración más difícil de probar.

*Mi inclinación:* volcado lógico diario en este módulo, porque es lo que se
puede restaurar y probar cada mes con confianza, y **el punto de recuperación
escrito de forma explícita en el manual**, para que nadie lo descubra el día que
lo necesite. El archivado de WAL, como mejora posterior con un disparador
concreto. Pero quiero tu evaluación: si la diferencia de complejidad es menor
de lo que creo, dilo.

### 3. Un solo mecanismo para todo lo que corre solo

Respaldo diario, prueba de restauración mensual, purga de datos de IP, purga del
límite de tasa, barrido de medios huérfanos, y el aviso de anonimización. Hoy
son scripts sueltos que nadie ejecuta. Que no terminen siendo tres mecanismos
distintos (un cron del host, un contenedor, un intervalo dentro del worker) que
nadie recuerda dónde está cada uno.

Propón uno. Considera: que funcione igual en Compose que en una plataforma
administrada (el plan no se ancló a ningún proveedor, y ya existe
`app/api/cron/notifications` como alternativa sin proceso largo); que cada tarea
deje rastro de cuándo corrió y cómo terminó; y **un interruptor de hombre
muerto**: la tarea avisa a un monitor externo cuando termina bien, y es el
silencio lo que dispara la alerta. Un respaldo que dejó de correr hace tres
semanas sin que nadie se enterara es la forma más común de no tener respaldo.

### 4. La retención de respaldos contra el aviso de privacidad

El aviso promete que los datos de IP se eliminan a los 90 días. Un respaldo
mensual retenido 12 meses contiene datos de IP de hace un año. Hay dos salidas
honestas: el aviso dice cuánto viven los datos en los respaldos, o la retención
se ajusta para que la promesa se cumpla. Lo que no es honesto es dejar el aviso
como está.

Esta la decide el dueño. Trae las dos opciones con su costo y, si recomiendas
cambiar el aviso, el párrafo propuesto.

### 5. El modo de sólo lectura

El plan lo pide para migraciones grandes ("nunca a la hora de la comida"), y el
módulo 19 lo va a necesitar para otra cosa: el degradado amable de una
suscripción vencida, que es sólo lectura durante 15 días antes de suspender.
**Diséñalo una vez, con dos alcances:** todo el despliegue (mantenimiento, en
este módulo) y una organización (suscripción, en el 19, que sólo tiene que
enchufarse).

Decide dónde se aplica. Las Server Actions son la única superficie de mutación
más tres manejadores de ruta, y eso es lo que hace posible un guardia central en
vez de una comprobación en cada acción. Decide qué ve el comensal que intenta
pedir, qué ve el mesero, y qué pasa con la cocina (el KDS y la comanda impresa)
durante la ventana.

Y una regla que no se negocia: **los webhooks de Stripe no se aceptan y se tiran
durante el modo de sólo lectura.** Responden 503 para que Stripe reintente
después. Un 2xx que no aplicó el evento es un cobro que el sistema no va a ver
nunca.

### 6. Monitoreo y página de estado

El plan pide una página de estado pública y un monitor externo sobre
`/api/health`. Decide si la página se construye o se usa la que ya ofrece el
servicio de monitoreo.

*Mi inclinación:* no construirla. Un servicio externo de monitoreo con página
de estado alojada resuelve las dos cosas, y una página de estado que vive en el
mismo servidor que se cayó es la que nadie puede ver cuando importa. Lo que sí
hay que construir es que `/api/health` diga la verdad: base, worker, antigüedad
del último respaldo exitoso, y cola de notificaciones. Decide también si se
separa en vivacidad y disponibilidad, y qué de todo eso es público: el estado
sí, los detalles no.

### 7. La anonimización que es manual a propósito

El comentario de `scripts/anonymize-old-guests.ts` defiende que sea una decisión
humana, y estoy de acuerdo. Pero una decisión humana necesita que alguien sepa
que le toca tomarla. Propón cómo se entera el dueño: un informe periódico de
cuántas filas ya pasaron los 24 meses, una entrada en el manual con su
calendario, o lo que consideres, sin convertirlo en algo automático.

**Para aquí.**

---

## Fase 2 — El respaldo

Lo decidido en las preguntas 1, 2 y 3:

- El volcado de la base como dueño, con el formato que permita restaurar
  selectivamente (`-Fc` o equivalente, y di por qué).
- Los medios, si el despliegue usa el driver local.
- Un manifiesto junto a cada respaldo: fecha, versión de la aplicación, última
  migración aplicada, tamaño y suma de verificación. Sin eso, un respaldo de hace
  cuatro meses no dice con qué código se restaura.
- Cifrado antes de salir del servidor.
- Subida con las credenciales que sólo escriben.
- Retención aplicada por el almacenamiento, no por un script que borra.
- El aviso al monitor externo al terminar bien.

Commits por pieza. Si algo de esto es un script de shell, que corra con `sh` de
POSIX o que diga por qué necesita bash, como `.githooks/commit-msg`.

---

## Fase 3 — La restauración y su prueba

Esta es la fase que da valor a la anterior.

Un procedimiento que parte de **un clúster de Postgres 17 vacío** y termina con
la aplicación arrancando contra él como `marea_app`, en el orden que la Fase 0
punto 2 haya demostrado. Después, una prueba automática que lo ejecuta de verdad
contra el último respaldo, en un contenedor desechable, y comprueba como mínimo:

- Que todas las migraciones aparecen como aplicadas y ninguna queda pendiente.
- Que las tablas con RLS tienen filas, leyéndolas como `marea_app` dentro de un
  negocio, no como dueño. Una restauración que sólo el dueño puede leer no es
  una restauración que sirva.
- Que el arranque acepta el rol (`DATABASE_ROLE_CHECK`).
- Que un archivo de medios referenciado por la base existe en la restauración.
- Cuánto tardó, de principio a fin.

Esa prueba corre sola cada mes con el mecanismo de la pregunta 3, avisa al
monitor, y deja el tiempo medido en un registro. **El primer tiempo medido va al
manual como tiempo de recuperación**, con la fecha en que se midió.

Decide dónde corre: en el servidor, en un contenedor desechable, o en CI. Si es
en CI, la llave de descifrado tiene que vivir en los secretos del repositorio, y
eso cambia a quién le confías todos los datos de todos los restaurantes. Trae
el argumento si no lo resolviste en la Fase 1.

---

## Fase 4 — Las tareas programadas

Todo lo que la Fase 0 punto 3 encontró sin programar, con el mecanismo de la
pregunta 3, más el aviso de la pregunta 7. Cada tarea deja rastro de cuándo
corrió, cuánto procesó y cómo terminó, y las que importan avisan al monitor.

Los scripts de mantenimiento ya recorren los negocios uno por uno con el cliente
normal (lo dice `docs/DEPLOY.md`); que siga siendo así. Ninguna tarea programada
necesita conexión de dueño salvo el respaldo.

---

## Fase 5 — Que la salud diga la verdad

Lo decidido en la pregunta 6: `/api/health` (o lo que lo sustituya) refleja la
base, el worker, la cola y la antigüedad del último respaldo, con umbrales que
estén escritos y justificados, no elegidos al azar. Un 503 cuando algo está
realmente mal; nunca un 200 con un `ok: false` enterrado, por la misma razón que
ya explica el comentario de la ruta.

El worker necesita un latido que alguien pueda leer. Diseña cuál, sin agregar un
proceso nuevo.

`docs/DEPLOY.md` explica cómo conectar el monitor externo y qué URL vigila.

Si la Fase 0 punto 5 se confirma, el worker deja de recibir `AUTH_SECRET`: la
validación del entorno tiene que poder distinguir qué exige cada proceso, en vez
de exigirle a todos lo que sólo uno usa.

---

## Fase 6 — El modo de sólo lectura

Lo decidido en la pregunta 5, con el alcance de despliegue completo en este
módulo y la costura lista para el alcance por organización del 19.

Pruebas: que cada Server Action que muta se rechaza con un mensaje legible (una
prueba que recorra las acciones registradas es mejor que una lista escrita a
mano, porque la lista se queda vieja con la próxima acción que alguien agregue),
que las lecturas siguen funcionando, y que los dos webhooks de Stripe responden
503 y no 2xx.

---

## Fase 7 — El manual de operación

`docs/RUNBOOK.md`, en inglés como el resto de `docs/` técnicos. Escrito para
alguien que no escribió el código y que está nervioso porque algo se cayó en
hora de comida. Como mínimo:

- Desplegar, y revertir un despliegue. Las migraciones de Prisma sólo van hacia
  adelante; cada migración escrita a mano desde el módulo 7 trae su "Revert
  with" en la cabecera. El manual dice cuándo alcanza con volver a la imagen
  anterior, cuándo hace falta el SQL de reversión, y cuándo la única salida es
  restaurar.
- Restaurar desde cero, paso a paso, con el tiempo medido en la Fase 3 y el
  punto de recuperación de la pregunta 2.
- Poner y quitar el modo de sólo lectura.
- Qué hacer si los webhooks de Stripe se atascan: cómo verlo, cómo reenviar
  eventos desde Stripe, y por qué la idempotencia por `eventId` hace que
  reenviar sea seguro.
- Rotar cada secreto: `AUTH_SECRET` (qué se invalida, según la Fase 0
  punto 5), las llaves de Stripe, los dos secretos de
  webhook, las contraseñas de los roles de la base, las credenciales de
  almacenamiento y de respaldo, y la llave de cifrado de respaldos (sin perder
  la capacidad de abrir los respaldos viejos).
- La anonimización: cuándo toca y cómo se decide.
- Dónde viven los secretos, fuera del repositorio.
- Qué verificar después de cada uno de estos procedimientos.

**La prueba del manual:** sigue la sección de restauración literalmente, en un
entorno limpio, sin usar nada que no esté escrito ahí. Cada vez que tengas que
saber algo que el manual no dice, el manual está incompleto. Reporta cuántas
veces pasó y qué agregaste.

---

## Fase 8 — Cierre

- `docs/PLAN-PRODUCCION.md`: la fila del módulo 18 en la tabla de estado, las
  casillas del criterio de terminado de la fase 8 que este módulo cumple, y el
  Apéndice F.
- `docs/DEPLOY.md`: el respaldo, el monitor y las tareas programadas.
- Obsidian, en `04-Proyectos-Verticales/Marea-Bitacora/`, siguiendo
  `09-Plantillas/Plantilla-Nota-de-Bitacora`: qué cambió para el dueño y qué
  tiene que hacer él a mano (crear el bucket, guardar la llave de cifrado,
  conectar el monitor).
- El pull request final a `main`, con `git diff --stat main..HEAD` antes.

---

## Reglas técnicas

- **Postgres 17.** El `pg_dump` y el `pg_restore` tienen que ser de la misma
  versión mayor que el servidor o más nuevos. Fíjalo en la imagen que los
  ejecute, no lo dejes a lo que traiga el sistema.
- **El respaldo corre como dueño; la verificación de la restauración, como
  `marea_app`.** Son dos preguntas distintas: si los datos están, y si la
  aplicación los puede leer.
- **Ninguna llave, contraseña ni credencial en el repositorio**, tampoco en
  ejemplos que parezcan reales. `.env.example` lleva los nombres de las
  variables nuevas y valores que obviamente no son reales.
- **Los secretos de respaldo no son los de la aplicación.** Si la aplicación se
  compromete, los respaldos tienen que sobrevivir.
- **Nada de esto depende de un proveedor.** Compatible con S3 significa
  compatible con S3: el mismo código tiene que funcionar contra cualquiera que
  hable ese protocolo, igual que el driver de almacenamiento del módulo 7.
- **Las tareas programadas son idempotentes.** Correr dos veces el mismo día no
  duplica un respaldo ni borra dos veces.

Y las de siempre: TypeScript estricto sin `any`, comentarios cortos que expliquen
**por qué** y no qué, y pull requests por debajo de las 400 líneas cuando se
pueda.

---

## Definición de terminado

- Existe un respaldo diario, cifrado, fuera del servidor, que la aplicación no
  puede borrar.
- Una restauración desde un clúster vacío funciona, está automatizada, corre
  sola cada mes, y su tiempo está medido y escrito en el manual.
- El punto de recuperación está escrito en el manual.
- Si el respaldo o la prueba de restauración dejan de correr, alguien se entera
  sin tener que ir a mirar.
- Las purgas que el aviso de privacidad promete corren solas, y la
  anonimización tiene quién la decida y cuándo.
- La retención de respaldos y el aviso de privacidad dicen lo mismo.
- `/api/health` responde 503 cuando el worker está caído o el último respaldo es
  demasiado viejo.
- El modo de sólo lectura se puede activar y desactivar sin desplegar, rechaza
  toda mutación con un mensaje legible, y los webhooks de Stripe responden 503.
- `docs/RUNBOOK.md` pasó la prueba de seguirlo literalmente.
- La prueba de promociones de la Fase 0 está explicada y corregida, no
  reintentada.
- La suite completa pasa: `npm run lint`, `tsc --noEmit`, unitarias,
  integración y e2e.

---

## Lo que NO debes hacer

- **No des por bueno un respaldo que no restauraste.**
- **No guardes la llave de cifrado en el mismo servidor que los respaldos
  protegen**, ni en el repositorio.
- **No uses las credenciales de almacenamiento de la aplicación para los
  respaldos.**
- **No automatices la anonimización.** Es manual a propósito; lo que falta es
  que alguien se entere de que le toca.
- **No construyas una página de estado** si la Fase 1 decidió usar la del
  monitor.
- **No aceptes webhooks con 2xx durante el modo de sólo lectura.**
- **No reintentes la CI hasta que la prueba de promociones pase.**
- **No sigas si hay un pull request abierto**, y no encadenes una rama sin haber
  comprobado antes qué trae de más con `git diff --stat main..HEAD`.
- **Cero emojis**, en el código, en los commits, en los pull requests y en
  Obsidian.

---

## Cómo trabajar

Fase 0 y para en la Fase 1. No empieces la Fase 2 sin las siete respuestas: la
cuarta es del dueño y cambia el aviso de privacidad, y la primera decide si los
respaldos sobreviven a que alguien comprometa la aplicación.
