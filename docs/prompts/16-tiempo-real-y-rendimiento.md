# Prompt para Claude Code — Módulo 16: tiempo real y rendimiento

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **Para al final de la Fase 3** con la propuesta de
> arquitectura del tiempo real. No hay parada de diseño: no hay pantallas
> nuevas.

---

El módulo 15 cerró el alcance original del Grupo 1. Desde aquí el plan deja de
añadir funcionalidad y empieza a hacer que lo construido aguante.

Este módulo ataca los cuellos de botella que la auditoría identificó hace nueve
módulos y que **siguen exactamente igual**, porque cada módulo intermedio tuvo
la instrucción explícita de no tocarlos. Ya no hay razón para esperar:

**El tiempo real es polling.** `app/api/orders/stream/route.ts` sigue con
`POLL_INTERVAL_MS = 2000` y una firma que compara. Son dos consultas cada dos
segundos **por cada cliente conectado**: 3,600 consultas por hora y por pantalla.
Con la cocina, la caja y tres meseros son 18,000 consultas por hora para
preguntar "¿cambió algo?". El comentario del archivo explica por qué se eligió
así —el pooler en modo transacción y Supabase Realtime— y **el módulo 7 eliminó
las dos restricciones**. Lleva nueve módulos siendo la respuesta correcta a una
pregunta que ya no existe.

**Cada evento re-renderiza el tablero completo.** `OrdersBoard.tsx:110` hace
`router.refresh()` en cada evento, y `listBoardOrdersRaw` no pagina: trae todos
los pedidos vivos más doce horas de entregados. Un pedido nuevo en la mesa 1
refresca el tablero entero para todos.

**No hay una sola línea de caché.** El grep de `unstable_cache`, `revalidateTag`
y `cacheTag` en todo el repositorio devuelve cero. La landing y el menú
consultan Postgres en cada visita. El menú cambia dos veces por semana y se lee
miles de veces al día.

**El folio serializa todos los pedidos.** `create-order.ts:205` incrementa
`Business.orderSequence` dentro de la transacción de cada pedido: **todos los
pedidos del negocio bloquean la misma fila**, dentro de una transacción que ya
hace varias consultas más.

**No se usa `next/image` en ninguna parte.** Quedan dos `<img>` crudos y cero
optimización de imágenes en la parte pública, que es la que Google mide.

Lee antes de empezar: `docs/CONVENCIONES.md`, `AGENTS.md`, el comentario
completo de cabecera de `app/api/orders/stream/route.ts`, y
`docs/PLAN-PRODUCCION.md` fase 6.

---

## Cómo trabajar

Como siempre: **todo en inglés** salvo los documentos de planeación, **un pull
request por fase** con ramas encadenadas, autoría exclusivamente tuya, cero
emojis, y `git diff --stat main..HEAD` antes de abrir cada pull request.

```bash
gh pr list --state open
git switch main && git pull
git switch -c feature/perf-fase-0 main
```

**El criterio que rige este módulo entero:** una optimización sin un número
antes y un número después no es una optimización, es una intuición. Cada fase
tiene que medir lo que mejora, y el número va en la descripción del pull
request. Si una fase no mejora lo que decía que iba a mejorar, se dice y se
revierte; no se queda "por si acaso".

**Una advertencia distinta a las de otros módulos:** aquí no se añade
comportamiento, se cambia cómo se entrega el que ya hay. Tienes 64 y pico de
archivos de prueba, umbrales de cobertura y tres E2E que describen el
comportamiento actual. **Si una prueba existente cambia de resultado, el módulo
rompió algo**, y esa es la señal más importante que vas a tener.

---

## Fase 0 — Pendientes arrastrados

**0.1 — Las dos verificaciones de infraestructura** siguen abiertas: SMTP contra
un proveedor real, e impresión contra una impresora térmica física. Confirma que
siguen listadas en el plan. No las resuelvas tú.

**0.2 — Línea base medida, antes de tocar nada.** Es el commit más importante de
la fase. Levanta el sistema con `docker-compose`, siembra datos, y mide y anota:

- Consultas a Postgres por minuto con una pantalla del tablero abierta y sin
  actividad. Con `pg_stat_statements` o contando en el log.
- Tamaño de la respuesta de `/admin/pedidos` con 50 pedidos vivos.
- Tiempo de respuesta de la landing y del menú público, en frío y en caliente.
- Lighthouse sobre la landing: LCP, CLS, TBT.

Guárdalo en `docs/perf-baseline.md`. Sin esto, las fases siguientes no tienen
contra qué compararse y el módulo se vuelve una cuestión de fe.

**0.3 — Limpieza de ramas fusionadas.**

---

## Fase 1 — Caché de lo público

La fase más barata y la de mayor efecto inmediato. Va primera por eso.

**Antes de elegir la herramienta, lee qué ofrece la versión de Next instalada.**
`AGENTS.md` ya te dice que la documentación está en `node_modules/next/dist/docs/`.
Entre `unstable_cache`, la directiva `use cache` y `cacheTag`/`cacheLife`, el
panorama cambió en las últimas versiones y no quiero que uses una API obsoleta
porque yo la nombré en un plan escrito hace un mes. **Dime cuál eliges y por
qué** en la descripción del pull request.

Qué se cachea, por etiqueta:

| Dato | Etiqueta | Invalida |
|---|---|---|
| Menú público | `menu:<businessId>` | Acciones de platillos, categorías y modificadores |
| Negocio y traducciones | `business:<businessId>` | Configuración |
| Ofertas destacadas | `promotions:<businessId>` | Acciones de promociones |
| Testimonios aprobados | `testimonials:<businessId>` | Moderación |
| Horario | `hours:<businessId>` | Editor de horarios |

Las acciones del panel ya llaman a `revalidatePath`; esto es añadirles la
invalidación por etiqueta al lado.

**Dos cosas que no se cachean, y conviene que estén dichas:** nada que dependa
de la sesión, y nada del panel. Una respuesta del panel cacheada entre usuarios
es una fuga de datos, no una optimización.

**`getCurrentBusiness` merece atención aparte.** Es el símbolo más conectado del
repositorio y hoy hace un `findUnique` por llamada. Tiene dos niveles distintos:
`cache()` de React deduplica dentro de una misma petición, la caché de datos
persiste entre peticiones. Necesita los dos, y no son lo mismo.

---

## Fase 2 — El folio deja de ser un cuello

`Business.orderSequence` serializa todos los pedidos del negocio contra una sola
fila. Sustitúyelo por un contador por negocio y día, que además produce un folio
que dice algo:

```prisma
model OrderCounter {
  businessId String
  /// Fecha local del negocio, "YYYY-MM-DD".
  localDate  String
  lastNumber Int    @default(0)

  @@id([businessId, localDate])
}
```

Con `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, que es atómico en una sola
sentencia y no bloquea nada más. La fecha local sale de los helpers que ya
existen; `create-order.ts` ya selecciona `business.timezone` para otra cosa.

**Tres cuidados:**

- **Los folios existentes no se tocan.** El formato nuevo arranca en la fecha de
  despliegue y el corte se documenta. Un pedido viejo tiene que seguir
  encontrándose por su folio de entonces.
- **`Business.orderSequence` se queda en el esquema** como histórico, con un
  comentario que diga que ya no se usa y desde cuándo. Borrarlo es una migración
  destructiva que no gana nada.
- **`@@unique([businessId, orderNumber])` sobre `Order` sigue vigente** y ahora
  protege un espacio de nombres distinto. Comprueba que el formato nuevo no
  puede colisionar con uno viejo.

Mide: pedidos concurrentes por segundo, antes y después.

---

## Fase 3 — Tiempo real de verdad (para y pregúntame)

La fase central, y la que tiene una decisión de arquitectura que no debes tomar
solo.

**El mecanismo** es un trigger de Postgres que hace `pg_notify` sobre los
eventos inmutables que ya existen —`OrderStatusEvent` es `INSERT` puro, que es
justo por lo que el esquema eligió escuchar ahí y no `UPDATE` sobre `Order`—, y
un proceso que escucha con `LISTEN` y multiplexa a los clientes SSE conectados.

**Lo que quiero que decidas y me expliques antes de escribir código:**

**1. Dónde vive el que escucha.** Las conexiones SSE están en el proceso web.
Si el `LISTEN` vive ahí, cada réplica necesita su propia conexión dedicada —lo
cual está bien, `NOTIFY` llega a todos los que escuchan— pero significa una
conexión más por réplica fuera del pool de Prisma. Si vive en el worker, hace
falta un canal del worker a las réplicas web, que es exactamente el problema que
estamos resolviendo, sólo que un nivel más arriba. Mi inclinación es en el
proceso web. Convénceme o corrígeme.

**2. Qué pasa cuando la conexión `LISTEN` se cae.** Esta es la parte que se hace
mal casi siempre: **las notificaciones emitidas mientras estabas desconectado no
se reenvían nunca**. Reconectar no basta: hace falta un barrido de recuperación
de los eventos posteriores al último visto. Sin eso, un pedido desaparece del
tablero y nadie se entera hasta que el cliente reclama. Dime cómo lo vas a
resolver.

**3. El respaldo.** Si `LISTEN` no está disponible —un pooler en medio, un
hosting que no lo permite— el sistema tiene que degradar al polling actual con
un intervalo largo, no dejar de funcionar. Que funcione peor es aceptable; que
no funcione, no.

**4. El límite de 8,000 bytes del payload de `pg_notify`.** El evento manda
`{ businessId, orderId, toStatus }` y el cliente pide el detalle. Confírmame que
no piensas mandar el pedido entero.

**Para aquí** con las cuatro respuestas.

---

## Fase 4 — El delta, y el tablero paginado

Con el mecanismo decidido:

- **El evento lleva el `orderId` que cambió**, y el cliente actualiza esa tarjeta
  y sólo esa. `router.refresh()` se conserva como **reconciliación** cada 60
  segundos y al recuperar el foco de la pestaña, no como el mecanismo principal.
- **Actualización optimista al avanzar** un pedido: la tarjeta se mueve de
  columna de inmediato y revierte si la acción falla.
- **Paginación por columna**, con un tope de 50 tarjetas y "ver más". Una cocina
  con más de 50 pendientes tiene un problema que no resuelve el scroll.
- **"Entregados" y "Cancelados" a carga bajo demanda.** Ya son pestañas
  separadas; aprovéchalo.
- **Afina el `include`.** El `select` de `payments` ya está ajustado y su
  comentario explica por qué; haz lo mismo con `items` y `modifiers`, que traen
  columnas que la tarjeta no usa.

**Ojo con la pantalla de cocina del módulo 13 y con la pública del pedido.** Las
tres consumen el mismo flujo y las tres tienen que seguir funcionando. La de
cocina es la que menos puede fallar: está colgada en una pared y nadie la mira
para ver si se desconectó.

Mide: consultas por minuto con una pantalla abierta, y tamaño del payload por
evento. La primera cifra debería caer dos órdenes de magnitud.

---

## Fase 5 — Imágenes y presupuesto de rendimiento

- **`next/image`** donde toca, con los `remotePatterns` que el módulo 7 ya
  configuró. Cuidado con el `<img>` de `ImageField`: es una vista previa de algo
  que el admin acaba de subir y puede no estar servida todavía por el
  optimizador. Trátalo aparte si hace falta y explica por qué.
- **`sizes` correcto** en las imágenes del menú. Un `next/image` sin `sizes`
  bien puesto descarga la imagen de escritorio en un celular y empeora lo que
  venías a arreglar.
- **Las dos familias de `next/font`** suman seis pesos entre Montserrat
  Alternates y Poppins. Revisa cuáles se usan de verdad y quita el resto.
- **Presupuesto en el CI:** Lighthouse sobre la landing con **LCP < 2.5 s** y
  **CLS < 0.1** en 4G simulada. Que falle el build si se pasa. Un número en el
  CI vale más que una intención en un documento.

---

## Fase 6 — La prueba de carga

Lo que cierra el módulo y lo que da la respuesta a "¿aguanta un viernes?".

Un escenario que se parezca a un servicio real, no a un benchmark: 200 pedidos
en diez minutos, cinco pantallas del tablero conectadas, y consultas al menú
público de fondo.

Qué se mide y qué tiene que pasar:

- Ningún error, ningún folio duplicado, ningún pedido perdido del tablero.
- Latencia p95 del checkout por debajo de 800 ms.
- Conexiones a Postgres estables, sin agotar el pool.
- El tablero sigue recibiendo eventos al final de la prueba.

**Propón la herramienta.** `k6` y `autocannon` son las obvias, pero un script
con `fetch` y concurrencia controlada no añade dependencia y probablemente
basta. Dime cuál y por qué; si pides una dependencia, que sea de desarrollo y
justificada.

Guarda el resultado junto a `docs/perf-baseline.md`, con las dos columnas: antes
y después.

---

## Fase 7 — Cierre

1. `graphify` y el generador.
2. Nota de bitácora en `Marea-Bitacora/16-Tiempo-real-y-rendimiento.md`. Aquí la
   tabla de decisiones importa más que en ningún otro módulo: dónde vive el
   `LISTEN`, cómo se recupera de una caída, qué API de caché elegiste, y el
   antes y después de cada cifra.
3. Marca la casilla en `Grupo-1-Comida-Bebida.md` y actualiza el plan.
4. Verificación de autoría y pull request. **Sin fusionar.**

---

## Reglas técnicas

Las de siempre. Seis propias del módulo:

- **Ninguna optimización sin medición.** Antes y después, en el pull request.
- **La conexión de `LISTEN` es dedicada**, de `node-postgres`, fuera del pool de
  Prisma, y no hace nada más.
- **Ningún comportamiento cambia.** Si una prueba existente cambia de resultado,
  algo se rompió.
- **Nada que dependa de la sesión se cachea.** Nunca.
- **Los triggers van en una migración escrita a mano**, como la `EXCLUDE` de
  reservaciones. Prisma no los genera y eso no es un problema: es un archivo SQL
  con un comentario que explica qué hace y por qué.
- **Degradar está permitido, fallar no.** Cada mecanismo nuevo tiene su camino
  de respaldo.

Dependencias nuevas autorizadas: **`pg`**, para la conexión de `LISTEN`. La
herramienta de carga, si la justificas, como dependencia de desarrollo. Nada más.

---

## Definición de terminado

- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` limpios, con la salida.
- [ ] CI en verde, cobertura dentro de umbral, **y ninguna prueba existente
      cambió de resultado**.
- [ ] `docs/perf-baseline.md` existe con las cifras de antes y de después.
- [ ] Con cinco pantallas conectadas una hora, las consultas a Postgres por
      tiempo real son **menos de 100**. Hoy serían más de 18,000.
- [ ] Un cambio de estado aparece en las demás pantallas en menos de un segundo.
- [ ] Mato la conexión `LISTEN` y la restauro: **ningún pedido se pierde del
      tablero**. Enséñame cómo lo provocaste.
- [ ] Con `LISTEN` no disponible, el sistema degrada a polling y sigue
      funcionando.
- [ ] El menú público se sirve de caché y se invalida al editarlo en el panel.
      Cronométralo en frío y en caliente.
- [ ] Ninguna respuesta del panel se sirve de una caché compartida.
- [ ] La prueba de carga pasa entera, con sus cuatro criterios.
- [ ] Los folios del formato nuevo no colisionan con los viejos, y un pedido
      anterior al corte se sigue encontrando.
- [ ] Lighthouse en CI cumple el presupuesto y falla si se pasa.
- [ ] La pantalla de cocina, el tablero y la pública del pedido siguen las tres
      funcionando.
- [ ] Un pull request por fase, todos con la plantilla llena, ninguno fusionado.
- [ ] Todo en inglés salvo los documentos de planeación.
- [ ] El grep de autoría devuelve vacío en todas las ramas.

---

## Lo que NO debes hacer

- **No metas Redis, ni una cola externa, ni un servicio de tiempo real de
  terceros.** El anti-objetivo del plan sigue vigente: `LISTEN/NOTIFY` sobre el
  Postgres que ya tienes resuelve el caso y es portátil. Si al investigarlo
  concluyes que no alcanza, **para y dime** con tu razón; no lo sustituyas por
  tu cuenta.
- **No construyas tablas de resumen precalculadas** para los reportes. El módulo
  12 anotó el umbral; no estamos cerca.
- **No cambies la máquina de estados de nada.**
- **No rediseñes el tablero ni la pantalla de cocina.** Cambia cómo se
  actualizan, no cómo se ven.
- **No toques multi-sucursal.** Módulo 17.
- **No optimices lo que no mediste.** Si el perfil no lo señala, no es un
  cuello, es una corazonada.
- **No retraduzcas** los documentos en español.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase.
`/security-review` en la Fase 1 —una caché mal acotada es una fuga de datos entre
usuarios— y en la Fase 3, por la conexión nueva a la base.

**Una parada:** al final de la Fase 3, con las cuatro respuestas. En lo demás
avanza de corrido, abriendo el pull request de cada fase antes de empezar la
siguiente.
