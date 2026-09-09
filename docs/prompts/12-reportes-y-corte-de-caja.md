# Prompt para Claude Code — Módulo 12: reportes de venta y corte de caja

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **Para al final de la Fase 1** a esperar aprobación
> del diseño, y otra vez al final de la Fase 3 con la propuesta de esquema.

---

El módulo 11 cerró el primer bloqueador de venta: ya salen correos. Este cierra
el segundo, y es distinto de todo lo anterior.

Los cinco módulos previos construyeron cosas que el dueño del restaurante **no
ve**: despliegue portátil, pruebas, cabeceras de seguridad, una cola de
notificaciones. Todo necesario, nada demostrable. Este módulo construye
**la pantalla que abre todos los días** y el procedimiento con el que cierra la
noche. Es donde el sistema deja de ser una promesa y empieza a justificar lo que
cuesta.

Hoy no existe ninguna de las dos. El sidebar ni siquiera tiene una entrada para
reportes: la matriz de permisos las contempla desde el módulo 1
(`docs/product/roles-y-alcance.md`, renglón "Reportes de venta") y nunca se
construyeron.

**Lo que sí está listo y hay que aprovechar, no reinventar:**

- El índice `@@index([businessId, placedAt])` sobre `Order` está puesto desde la
  primera migración con el comentario "reportes por rango de fechas". Se puso
  para esto.
- `@@index([menuItemId])` sobre `OrderItem` lleva el comentario "cuántas
  langostas vendimos este mes". Igual.
- Los totales de cada pedido están **congelados** (`subtotal`, `taxTotal`,
  `total`) y el esquema argumenta por qué. Un reporte que los recalcule desde el
  catálogo vivo está mal por construcción.
- `Order.staffId`, `Payment.collectedByUserId` y `Refund.createdById` existen
  precisamente para las columnas "por empleado".
- `businessLocalDateParts` y `localWallClockToUtc` en
  `lib/reservations/availability.ts` ya resuelven fechas en la zona del negocio,
  horario de verano incluido. **No escribas la tercera versión de esa
  matemática.**

Lee antes de empezar: `docs/CONVENCIONES.md`, `AGENTS.md`,
`docs/product/roles-y-alcance.md`, `docs/DATABASE.md` y
`docs/PLAN-PRODUCCION.md` fase 4.

---

## Cómo trabajar

Como en los tres módulos anteriores: **todo en inglés** salvo los documentos de
planeación, **un pull request por fase** con ramas encadenadas, autoría
exclusivamente tuya, cero emojis.

```bash
gh pr list --state open          # vacío antes de empezar el módulo
git switch main && git pull
git switch -c feature/reports-fase-0 main
```

Las siete ramas del módulo 11 tienen que estar en `main` antes de empezar.

**Una advertencia sobre el historial reciente.** El módulo 10 necesitó un
`chore/recover-hardening-fases-2-7` porque el trabajo de varias fases no llegó a
`main`. Con ramas encadenadas eso pasa cuando una se fusiona con *squash* y las
siguientes quedan apuntando a commits que ya no existen. Antes de abrir el pull
request de cada fase, comprueba que su diff contra `main` contiene **sólo** lo
de esa fase:

```bash
git log --oneline main..HEAD
git diff --stat main..HEAD
```

Si aparece trabajo de una fase anterior que creías fusionada, para y dime.

---

## Fase 0 — Cerrar el módulo 11

**0.1 — Entrada de reportes en el sidebar.** `nav-config.ts` no tiene la clave
`reports`. Añádela con `roles: ADMIN_ONLY` y `enabled: false` de entrada; la
enciendes en la Fase 4, cuando la pantalla exista. El patrón de "visible pero
bloqueado" ya lo usan `promotions` y `testimonials`.

**0.2 — Limpieza de ramas fusionadas**, como siempre.

---

## Fase 1 — Diseño (para y espera aprobación)

Dos pantallas y un documento impreso. Las tres tienen público distinto y eso
tiene que verse en el diseño.

**Reportes de venta.** La abre el dueño con el café, en un celular tanto como en
una laptop. Lo primero que quiere saber es **cuánto se vendió ayer y si eso es
bueno o malo**, así que la comparación contra el periodo anterior no es un
adorno: es la mitad del mensaje. Enséñame cómo se ve un día flojo, no sólo uno
bueno — un cero mal presentado parece un error del sistema.

**Corte de caja.** La abre el cajero de pie, con prisa, al cerrar. El flujo es
abrir turno, registrar movimientos, contar el cajón y cerrar. Enséñame cómo se
ve el momento incómodo: **cuando lo contado no cuadra con lo esperado**. Esa
pantalla es la razón de existir del módulo, no un caso de error.

**El comprobante de corte**, que se imprime o se guarda como PDF y se archiva.
Diséñalo como pieza de papel, igual que la hoja de QR del módulo 6.

Y una decisión que quiero ver resuelta en el diseño, no en el código: **dónde
vive el corte de caja**. ¿Sección propia en el sidebar, o dentro del tablero de
pedidos, que es donde el cajero ya está? Propón con tu razón.

Propón, enséñame y **para aquí**.

---

## Fase 2 — Reportes de venta

Pantalla en `/admin/reportes`, `BUSINESS_ADMIN` y superior, con selector de
rango: hoy, ayer, últimos 7 días, este mes, y un rango a mano.

**El rango se resuelve en la zona horaria del negocio.** "Hoy" empieza a la
medianoche local, no a la del servidor ni a la del navegador del dueño. Reutiliza
los helpers que ya existen.

Métricas, en este orden de importancia:

1. **Ventas del periodo:** total, número de pedidos, ticket promedio, y la
   comparación contra el periodo anterior equivalente.
2. **Ventas por día**, como gráfica de barras.
3. **Por método de pago:** efectivo contra tarjeta, con el total a conciliar
   contra el cajón. Es el puente con la Fase 4.
4. **Platillos más vendidos**, por unidades **y** por ingreso. No son la misma
   lista, y la diferencia entre ambas es información de negocio pura: el
   platillo que más se vende rara vez es el que más deja.
5. **Por tipo de pedido:** en mesa contra para llevar.
6. **Por empleado:** pedidos atendidos y efectivo cobrado.
7. **Cancelaciones y reembolsos**, con motivo y autor.

### Cuatro reglas que evitan un reporte que miente

- **Los importes salen de los totales congelados del pedido**, nunca
  recalculados desde el catálogo.
- **Las cancelaciones no cuentan como venta**, pero se muestran aparte. Un
  reporte que las esconde impide ver que se cancela el 15% de los pedidos.
- **Los reembolsos se restan del periodo en que se emitieron**, no de aquel en
  que se cobró el pedido original. Es lo que hace un contador, y lo contrario
  produce cuadres imposibles cuando un reembolso cruza el cierre de mes.
- **Sólo cuentan los pagos en estado `SUCCEEDED`**. Un `PENDING` no es dinero.

**Exportación a CSV** de cada tabla. El contador del restaurante no va a entrar a
tu panel: quiere un archivo. Con BOM UTF-8, o Excel destroza los acentos.

**Sobre el rendimiento:** con el volumen de un restaurante las agregaciones en
vivo van sobradas, y el índice ya está. **No construyas tablas de resumen
precalculadas.** Anota en la nota de bitácora a partir de qué volumen habría que
hacerlo (del orden de 50 000 pedidos) y déjalo ahí.

---

## Fase 3 — El esquema del corte de caja (para y pregúntame)

Es el cambio de esquema más grande desde el módulo 2 y quiero verlo antes de que
se escriba la migración.

El problema concreto: `Payment.collectedByUserId` dice **quién** cobró, pero no
**en qué turno**. Sin esa agrupación no hay forma de contar el cajón contra el
sistema al final de la noche, que es literalmente lo que pide un restaurante.

Mi propuesta, para que la critiques y la mejores:

```prisma
/// Turno de caja: de la apertura con fondo fijo al arqueo del cierre.
model CashSession {
  id         String @id @default(cuid())
  businessId String

  openedById   String
  openedAt     DateTime @default(now())
  openingFloat Decimal  @db.Decimal(10, 2)

  closedById     String?
  closedAt       DateTime?
  /// Lo que el sistema dice que debería haber. Congelado al cerrar, igual que
  /// los totales de Order: si mañana se corrige un pago viejo, este número no
  /// puede moverse.
  expectedAmount Decimal? @db.Decimal(10, 2)
  countedAmount  Decimal? @db.Decimal(10, 2)
  /// countedAmount - expectedAmount. Guardado y no derivado, por lo mismo.
  difference     Decimal? @db.Decimal(10, 2)
  notes          String?
}

/// Entradas y salidas de efectivo que no son un pedido: retiro a la bóveda,
/// pago al proveedor de verduras, cambio de billete. Sin esto la diferencia
/// del arqueo siempre "falla" y el corte deja de servir.
model CashMovement {
  id            String   @id @default(cuid())
  cashSessionId String
  type          CashMovementType   // DEPOSIT | WITHDRAWAL
  amount        Decimal  @db.Decimal(10, 2)
  reason        String
  createdById   String
  createdAt     DateTime @default(now())
}
```

Más una columna `Payment.cashSessionId String?` con su índice.

**Cuatro preguntas que quiero que contestes antes de escribir nada:**

1. **¿Una caja por negocio o varias simultáneas?** Un restaurante chico tiene un
   cajón; uno con barra y mostrador tiene dos. Si la respuesta es "una", dilo y
   ponle una restricción que lo garantice: dos turnos abiertos a la vez rompen
   la atadura de `Payment` a su sesión sin que nadie se entere.
2. **¿Qué pasa con un pago en efectivo cuando no hay caja abierta?** Mi
   inclinación es rechazar el cobro, porque un pago sin turno es dinero que
   nunca aparecerá en un corte. Pero eso significa que el cajero no puede cobrar
   hasta abrir turno, y hay que decidirlo a conciencia.
3. **¿Y un reembolso en efectivo?** Sale del mismo cajón y tiene que restar del
   esperado. ¿Es un `CashMovement` automático, o cuelga del `Refund`?
4. **¿Se puede reabrir un turno cerrado?** Mi respuesta es no —un corte cerrado
   es un documento— y la corrección se hace con un movimiento de ajuste en el
   turno siguiente, que deja rastro. Convéncete tú.

**Para aquí** con tus respuestas y tu propuesta de esquema.

---

## Fase 4 — Corte de caja

Con el esquema aprobado:

- **Abrir turno** con fondo inicial. `STAFF` y superior: lo hace el cajero.
- **Cobrar en efectivo** ata el `Payment` al turno abierto, dentro de la misma
  transacción que ya usa `collectCashPaymentAction`.
- **Registrar movimientos** con motivo obligatorio. Un retiro sin motivo es un
  faltante con otro nombre.
- **Cerrar turno:** el sistema muestra el esperado —fondo, más cobros en
  efectivo, más depósitos, menos retiros—, el cajero teclea lo contado, y la
  diferencia se congela. Si no cuadra, se pide una nota; no se bloquea el
  cierre. Un sistema que no deja cerrar la caja hasta que cuadre produce cortes
  falsos, que es peor que un descuadre registrado.
- **Historial de cortes** con sus diferencias, sólo `BUSINESS_ADMIN`. Abrir y
  cerrar es del cajero; ver el patrón de descuadres es del dueño. Añade ese
  renglón a la matriz de permisos en el mismo commit.
- **Comprobante imprimible** del corte.

Enciende `enabled: true` en la entrada del sidebar.

---

## Fase 5 — Cierre

1. `graphify` y el generador.
2. Nota de bitácora en `Marea-Bitacora/12-Reportes-y-corte-de-caja.md`. La tabla
   de decisiones lleva las cuatro respuestas de la Fase 3 y dónde quedó el corte
   en la navegación.
3. Marca "Reportes de venta y corte de caja" en la checklist de
   `Grupo-1-Comida-Bebida.md`. Es la segunda casilla de "falta para poder
   venderlo" que se cierra.
4. Actualiza la tabla de estado de `docs/PLAN-PRODUCCION.md`.
5. Verificación de autoría y pull request. **Sin fusionar.**

---

## Reglas técnicas

Las de siempre. Cinco propias del módulo:

- **Ningún importe se recalcula.** Los reportes leen totales congelados. Si un
  número no cuadra, el error está en quien lo escribió, no en quien lo suma.
- **Toda fecha se resuelve en la zona del negocio**, con los helpers que ya
  existen.
- **`Prisma.Decimal` no cruza a un Client Component.** Un reporte es dinero en
  la pantalla: pasa por `lib/dto/`. Y nada de `toNumber()` para sumar.
- **Las agregaciones van en `queries.ts`, no en el componente.** Una pantalla que
  trae mil pedidos y suma en el cliente funciona hasta el día que deja de
  funcionar.
- **Cada cifra del reporte tiene una prueba** que la contrasta contra datos
  sembrados y calculados a mano. Es dinero: aplica la regla de las convenciones.

Dependencias nuevas: **ninguna autorizada**. La gráfica de barras se dibuja con
SVG o CSS sobre los tokens que ya existen en `docs/design.md`; una librería de
gráficas para siete barras no se gana el sitio. Si crees que sí, pregunta.

---

## Definición de terminado

- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` limpios, con la salida.
- [ ] CI en verde, cobertura dentro de umbral.
- [ ] **El reporte de un día cuadra al centavo** contra la suma manual de los
      pedidos de ese día en la base. Enséñame las dos cifras.
- [ ] Un reembolso emitido en octubre sobre un pedido de septiembre aparece
      restando en octubre, y septiembre no cambia.
- [ ] Un pedido cancelado no suma a las ventas y sí aparece en su tabla.
- [ ] El rango "hoy" empieza a la medianoche del negocio. Pruébalo cambiando
      `Business.timezone` y enséñame que el corte de día se mueve.
- [ ] El CSV abre en Excel con los acentos correctos.
- [ ] No se puede cobrar en efectivo con la caja cerrada.
- [ ] Un corte con un retiro registrado da diferencia cero.
- [ ] Un corte con descuadre se cierra, exige nota, y queda registrado.
- [ ] Un `STAFF` abre y cierra caja pero **no** ve el historial de cortes ni los
      reportes de venta.
- [ ] El comprobante de corte se imprime en una hoja.
- [ ] Un pull request por fase, todos con la plantilla llena, ninguno fusionado.
- [ ] Todo en inglés salvo los documentos de planeación.
- [ ] El grep de autoría devuelve vacío en todas las ramas.

---

## Lo que NO debes hacer

- **No construyas la comanda impresa de cocina ni la pantalla KDS.** Es el
  módulo 13 y es lo siguiente.
- **No toques inventario ni promociones.** Módulo 14. Aunque el reporte de
  platillos más vendidos dé ganas de cruzarlo con existencias, no.
- **No construyas tablas de resumen precalculadas** ni tareas nocturnas de
  agregación. Anota el umbral y sigue.
- **No metas una librería de gráficas.**
- **No cambies la máquina de estados de pagos** para acomodar la caja. Si el
  corte necesita un estado nuevo, para y dime: probablemente el diseño está mal.
- **No construyas facturación CFDI.** Módulo 18.
- **No retraduzcas** los documentos en español.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase.
`/security-review` en la Fase 4: el corte de caja mueve dinero y cruza dos roles.

**Dos paradas:** al final de la Fase 1 con el diseño, y al final de la Fase 3 con
las cuatro respuestas y la propuesta de esquema. En lo demás avanza de corrido,
abriendo el pull request de cada fase antes de empezar la siguiente.
