# Prompt para Claude Code — Módulo 13: comanda impresa y pantalla de cocina

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **Para al final de la Fase 1** con el diseño de la
> pantalla de cocina y del ticket, y otra vez al final de la Fase 2 con la
> propuesta de esquema del agente.

---

El módulo 12 cerró el segundo bloqueador de venta. Este cierra el tercero, y es
el primero del plan que **sale del navegador**.

Hasta ahora todo lo construido vive en una pestaña. Este módulo tiene que llegar
a una impresora térmica que está en la cocina de un restaurante, detrás del
router de ese local, sin IP pública y sin nadie que sepa configurarla. Ese es el
problema real del módulo; el resto es la parte fácil.

**Por qué importa.** En México la cocina imprime. Un sistema sin comanda compite
contra una libreta y pierde, porque la libreta no se cae cuando falla el WiFi y
no hay que enseñarle a nadie a usarla. La demo más convincente que puedes hacerle
a un dueño de restaurante es que alguien pida desde el celular en la mesa y el
ticket salga solo en la cocina, tres segundos después.

Y hay un segundo entregable que tu propio documento de producto lleva pidiendo
desde el módulo 1. `docs/product/roles-y-alcance.md` describe tres superficies
distintas —cocina, mesero, caja— y decidió colapsarlas en una sola pantalla para
la v1. Esa decisión ya se pagó: el tablero de `/admin/pedidos` sirve al mesero
con su celular, pero **no** a una pantalla colgada en la cocina que alguien lee
de pie a dos metros. Este módulo construye la que faltaba.

**Lo que ya existe y hay que reutilizar, no rehacer:**

- `lib/realtime/useEventStream.ts` y `app/api/orders/stream/route.ts` con su
  reconexión y su backoff. **No los toques**: siguen siendo polling y eso se
  arregla en el módulo 16, no aquí.
- `components/admin/AgingIndicator.tsx`, que ya pinta la antigüedad de un pedido.
- `lib/realtime/chime.ts`, el aviso sonoro.
- `OrderItem.nameSnapshot`, `quantity`, `notes` y sus modificadores congelados:
  la comanda ya tiene todo lo que necesita imprimir.
- `Order.guestCount`, `Order.notes`, `Order.type` y la mesa.

Lee antes de empezar: `docs/product/roles-y-alcance.md` —**la sección 1, sobre
las tres superficies**—, `docs/CONVENCIONES.md`, `AGENTS.md` y
`docs/PLAN-PRODUCCION.md` fase 4.3 y 4.4.

---

## Cómo trabajar

Como siempre: **todo en inglés** salvo los documentos de planeación, **un pull
request por fase** con ramas encadenadas, autoría exclusivamente tuya, cero
emojis.

```bash
gh pr list --state open          # vacío antes de empezar el módulo
git switch main && git pull
git switch -c feature/kitchen-fase-0 main
```

Y antes de abrir el pull request de cada fase, la comprobación que el módulo 12
incorporó:

```bash
git diff --stat main..HEAD       # sólo lo de esta fase
```

---

## Fase 0 — Pendiente del módulo 12

**0.1 — El envío por SMTP sigue sin probarse contra un proveedor real.** Es la
única casilla que quedó abierta del módulo 11 y no es código: hace falta un
dominio con SPF, DKIM y DMARC. No lo resuelvas tú, pero **déjalo escrito** donde
se vea: una línea en la sección de estado de `docs/PLAN-PRODUCCION.md` marcándolo
como verificación pendiente de infraestructura, no de desarrollo. Un pendiente
que sólo vive en una conversación deja de existir.

**0.2 — Limpieza de ramas fusionadas.**

---

## Fase 1 — Diseño (para y espera aprobación)

Dos piezas, y la distancia de lectura es lo que las separa.

**La pantalla de cocina.** Una televisión colgada a dos metros, en un sitio con
vapor, ruido y gente con las manos ocupadas. Nadie va a leer un texto de 13
píxeles ni a apuntar con precisión a un botón pequeño. Tu documento de producto
ya lo describió: *"una sola cosa: los pedidos entrantes, en letra grande, sin
menús ni navegación"*.

Enséñame:

- Cómo se ve **con un pedido** y cómo se ve **con veinte**. Lo segundo es el
  viernes a las nueve, y es donde los diseños de cocina se rompen.
- Qué pasa cuando un pedido lleva **veinte minutos sin avanzar**. La antigüedad
  no es un dato: es la única alarma que tiene la cocina.
- Cómo se distingue de un vistazo una mesa de un pedido para llevar.
- Dónde van las **notas del cliente** ("sin cebolla"), que son lo que provoca
  una queja si se pasan por alto, y hoy compiten en tamaño con el nombre del
  platillo.
- Cuántos gestos hacen falta para avanzar un pedido. La respuesta correcta es
  uno.

**El ticket de comanda.** Papel térmico de 80 mm, monocromo, sin medios tonos.
Diséñalo como pieza de papel, igual que la hoja de QR del módulo 6 y el
comprobante de corte del 12. Y ojo: **la comanda de cocina no lleva precios**. El
ticket del cliente sí, y es un formato distinto. Son dos plantillas, no una con
un condicional.

Propón, enséñame y **para aquí**.

---

## Fase 2 — El agente de impresión: arquitectura y esquema (para y pregúntame)

Aquí está la decisión que define el módulo.

**El problema, dicho claro:** tu servidor está en la nube. La impresora está en
la cocina, detrás del NAT del restaurante. El servidor **no la ve, y no debe
verla**. Exponer una impresora a internet no es una opción que valga la pena
discutir.

Tres caminos, y sólo uno es bueno:

| Camino | Veredicto |
|---|---|
| Imprimir desde el navegador con `@media print` | Sirve como respaldo desde el día uno, pero exige que alguien pulse un botón. La cocina no pulsa botones. |
| Servidor a impresora por internet | No. |
| **Agente local que consume la cola** | La correcta. |

**El agente** es un proceso pequeño que corre **dentro del local** —una Raspberry
Pi de mil pesos, o la misma máquina de la caja— y que:

1. Se autentica con un token de dispositivo.
2. Escucha el flujo de eventos que ya existe, o consulta una cola.
3. Manda ESC/POS por TCP al puerto 9100 de la impresora.
4. Reintenta si no hay papel, y encola si se cae la conexión.

### Lo que quiero que decidas y me digas antes de escribir código

**1. Cómo se entera el agente.** ¿Se cuelga del SSE que ya existe con un scope
nuevo, o consulta una cola de trabajos de impresión como hace el worker de
notificaciones? La segunda opción cuesta una tabla más, pero da reintentos,
historial y respuesta a la pregunta "¿se imprimió la comanda del pedido 142?",
que el dueño **va** a hacer. Mi inclinación es la cola, reutilizando el patrón
que el módulo 11 ya dejó probado. Convénceme o corrígeme.

**2. El modelo del dispositivo.** Mi propuesta, para que la critiques:

```prisma
/// Un aparato del local que consume trabajo del servidor: hoy una impresora,
/// mañana quizá una pantalla de cocina que se autentica sola.
model Device {
  id         String @id @default(cuid())
  businessId String
  name       String       // "Impresora cocina", "Caja 1"
  kind       DeviceKind   // PRINTER
  /// Hash del token, nunca el token. Se muestra una sola vez al crearlo.
  tokenHash  String  @unique
  lastSeenAt DateTime?
  isActive   Boolean @default(true)
}
```

`lastSeenAt` no es decoración: es lo que permite que el panel diga "la impresora
de cocina lleva 40 minutos sin responder", que es exactamente lo que el dueño
necesita saber **antes** de que se le acumulen las comandas.

**3. Qué pasa cuando la impresora está muerta.** ¿El pedido se acepta igual? Mi
respuesta es sí, sin duda: un pedido que se rechaza porque no hay papel es peor
que un pedido sin comanda. Pero entonces hace falta que la pantalla de cocina lo
haga visible, porque es la red de seguridad. Dime si estás de acuerdo.

**4. Dónde vive el código del agente.** ¿Un directorio en este repositorio
(`agent/`), un paquete del workspace, o un repositorio aparte? Se despliega en
otra máquina, con otro ciclo de vida y otras dependencias. Tiene que poder
instalarse en una Raspberry sin arrastrar Next, Prisma ni React.

**Para aquí** con las cuatro respuestas.

---

## Fase 3 — La cola de impresión y el agente

Con lo decidido en la Fase 2. Tres cosas que se olvidan y cuestan una tarde
cada una:

- **ESC/POS es bytes, no texto.** Los acentos dependen de la página de códigos
  de la impresora, y "Pescado a la Veracruzana" sale como galimatías si no se
  selecciona. Fija la página de códigos explícitamente y **prueba con acentos y
  con eñes** desde el primer intento, no al final.
- **El corte de papel es un comando**, y sin él la comanda siguiente se imprime
  pegada a la anterior.
- **La impresora acepta la conexión aunque no tenga papel.** Un `write` a
  un socket TCP que no falla no significa que algo se haya impreso. Lee el
  estado si el modelo lo soporta, y si no, **dilo en la nota de bitácora** como
  limitación conocida en vez de fingir que hay confirmación.

**Reimprimir** es una acción de primera clase, no un extra: el papel se atora,
se moja, se pierde. Botón por pedido en el tablero, `STAFF` y superior.

**El respaldo del navegador** se construye en esta fase, no "si da tiempo": una
vista imprimible del pedido con `@media print`. Es lo que hace que el sistema
sirva el día uno en un restaurante que todavía no ha instalado el agente, y el
día que el agente se cae.

---

## Fase 4 — La pantalla de cocina

`/admin/cocina`, sin barra lateral ni cabecera. Sirve a un dispositivo que se
loguea una vez y se queda meses.

- Columnas Pendiente, Preparando y Listo, con tipografía enorme.
- Antigüedad visible por tarjeta, con `AgingIndicator`.
- Aviso sonoro para pedido nuevo, con `chime.ts`, y un control para silenciarlo
  que **persista**: nadie quiere volver a activarlo cada vez que la tele
  parpadea.
- **Un solo gesto por pedido:** avanzar. Nada de menús contextuales.
- Pantalla completa y `WakeLock` para que la televisión no se duerma.
- Estado de la impresora visible, según la Fase 2, punto 3.

**Lo que esta pantalla no tiene:** navegación, filtros, precios, datos del
cliente, botones de cancelar o cobrar. Todo eso vive en `/admin/pedidos` y
meterlo aquí es lo que convierte una pantalla de cocina en un tablero más.

Añade la entrada al sidebar con `roles: STAFF_UP`, y que **no** aparezca dentro
de la propia pantalla de cocina.

---

## Fase 5 — Cierre

1. `graphify` y el generador.
2. Nota de bitácora en `Marea-Bitacora/13-Comanda-y-cocina.md`. La tabla de
   decisiones lleva las cuatro respuestas de la Fase 2 y las limitaciones reales
   del hardware que hayas encontrado.
3. **Documenta la instalación del agente** en `docs/` como si la fuera a seguir
   el dueño del restaurante, no tú: qué comprar, cómo conectar la impresora, qué
   teclear. Es lo que decide si esto se instala o se queda en el repositorio.
4. Marca la casilla en `Grupo-1-Comida-Bebida.md` y actualiza la tabla de estado
   de `docs/PLAN-PRODUCCION.md`.
5. Verificación de autoría y pull request. **Sin fusionar.**

---

## Reglas técnicas

Las de siempre. Cinco propias del módulo:

- **El agente no habla con la base de datos.** Sólo con la API del servidor, con
  su token. Un proceso en el local de un cliente no tiene credenciales de
  Postgres.
- **El token del dispositivo se guarda como hash**, se muestra una vez, y se
  puede rotar. Mismo criterio que las contraseñas temporales del módulo 1.
- **La comanda se genera en el servidor**, no en el agente. El agente recibe
  bytes o un documento ya resuelto y los manda a la impresora. Así una
  corrección de formato es un despliegue del servidor, no una visita al local.
- **Nada de dependencias de impresión en el paquete principal.** Lo que necesite
  el agente vive con el agente.
- **La pantalla de cocina no consulta más de lo que muestra.** Es un dispositivo
  que va a estar conectado doce horas seguidas.

Dependencias nuevas autorizadas: sólo en el paquete del agente, y sólo lo mínimo
para hablar ESC/POS por TCP. En el paquete principal, ninguna.

---

## Definición de terminado

- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` limpios, con la salida.
- [ ] CI en verde, cobertura dentro de umbral.
- [ ] Un pedido nuevo imprime su comanda en **menos de tres segundos**.
      Cronométralo y dime el número.
- [ ] La comanda sale con acentos y eñes correctos, y con el papel cortado.
- [ ] Desconectar la impresora, hacer dos pedidos, reconectarla: **las dos
      comandas salen**, en orden, sin duplicar.
- [ ] Matar el agente a media impresión y reiniciarlo: no se imprime dos veces.
- [ ] Reimprimir desde el tablero funciona.
- [ ] La vista imprimible del navegador funciona sin agente.
- [ ] La comanda de cocina **no lleva precios**; el ticket del cliente sí.
- [ ] El panel muestra que la impresora está viva, y lo muestra en rojo cuando
      lleva rato sin responder.
- [ ] `/admin/cocina` se lee de pie a dos metros. Enséñame la foto o la captura
      a tamaño real.
- [ ] Con veinte pedidos simultáneos la pantalla sigue siendo legible y no hay
      que hacer scroll para ver los más viejos.
- [ ] El aviso sonoro se puede silenciar y la preferencia sobrevive a recargar.
- [ ] Un `STAFF` entra a `/admin/cocina`; el resto del panel sigue como estaba.
- [ ] La guía de instalación del agente la puede seguir alguien que no programa.
- [ ] Un pull request por fase, todos con la plantilla llena, ninguno fusionado.
- [ ] Todo en inglés salvo los documentos de planeación.
- [ ] El grep de autoría devuelve vacío en todas las ramas.

---

## Lo que NO debes hacer

- **No toques el SSE ni el polling.** Es el módulo 16. Aquí se consume lo que
  hay, aunque dé ganas.
- **No construyas inventario ni promociones.** Módulo 14.
- **No metas cajón de dinero, lector de tarjetas ni báscula.** Un solo periférico
  en este módulo.
- **No hagas configurable el formato de la comanda** desde el panel. Un formato
  bien hecho, en código. La personalización por cliente llega cuando haya
  clientes que la pidan.
- **No mandes notificaciones al personal.** Sigue vigente desde el módulo 11: el
  tablero en vivo es el canal.
- **No cambies la máquina de estados de pedidos.** Este módulo la consume.
- **No retraduzcas** los documentos en español.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase.
`/security-review` en la Fase 2 y en la Fase 3: estás creando un tipo de
credencial nuevo y un proceso que corre fuera de tu infraestructura.

**Dos paradas:** al final de la Fase 1 con el diseño, y al final de la Fase 2 con
las cuatro respuestas. En lo demás avanza de corrido, abriendo el pull request de
cada fase antes de empezar la siguiente.

Y una nota práctica: **si no tienes una impresora térmica a mano**, dilo en la
Fase 2 y planteamos cómo verificarlo —hay emuladores ESC/POS que reciben en el
9100 y vuelcan lo que llega—. Lo que no vale es dar por terminado el módulo
sobre un dispositivo que nadie probó.
