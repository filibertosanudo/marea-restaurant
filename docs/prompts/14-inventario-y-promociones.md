# Prompt para Claude Code — Módulo 14: inventario y promociones

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **Para al final de la Fase 1** con el diseño, y otra
> vez al final de la Fase 3 con las decisiones del motor de promociones.

---

Los módulos 12 y 13 cerraron la operación diaria: el dueño ya tiene reportes y
corte de caja, la cocina ya imprime y tiene su pantalla. Este módulo es
distinto: **no construye nada nuevo, termina dos cosas a medio construir.**

Son las dos brechas más raras del proyecto, porque en ambas la parte difícil ya
está hecha y lo que falta es la parte fácil.

**Inventario.** `createOrderFromCart` descuenta existencias de forma atómica
—con el guarda `stockQuantity: { gte: quantity }` que impide que se vaya a
negativo bajo concurrencia—, `cancelOrderAction` las devuelve y restaura la
disponibilidad si cruzó de cero, y `getPublicMenuRaw` oculta lo agotado. Todo
correcto, todo probado desde el módulo 9. Y **no existe una sola pantalla para
activarlo**: `buildMenuItemSchema` no incluye `trackInventory` ni
`stockQuantity`, así que esas columnas nunca cambian de su valor por defecto y
el módulo entero es inalcanzable desde el panel. Lleva así desde el módulo 2.

**Promociones.** El esquema tiene `Promotion` con reglas ricas —porcentaje,
monto fijo, precio de combo, `daysOfWeek`, ventana horaria, `usageLimit`,
`perUserLimit`, `minOrderTotal`, `maxDiscount`, `appliesToOrderType`—, sus
traducciones, su tabla de platillos aplicables, y `OrderPromotion` para congelar
el descuento aplicado. `Order.discountTotal` existe como columna. **Nada de eso
se usa.** `create-order.ts` calcula `subtotal`, luego `taxTotal`, luego `total`,
y nunca menciona una promoción. `OrderPromotion` jamás se escribe. Hoy **ningún
descuento se aplica jamás** a un pedido, y la sección de ofertas del landing es
decorativa.

El sidebar tiene `promotions` con `enabled: false` desde el módulo 1. Es scope
visible que un cliente va a pedir en la primera demo.

Lee antes de empezar: `docs/CONVENCIONES.md`, `AGENTS.md`, el modelo
`Promotion` **con sus comentarios** en `prisma/schema.prisma`, y
`docs/PLAN-PRODUCCION.md` fase 5.1 y 5.2.

---

## Cómo trabajar

Como siempre: **todo en inglés** salvo los documentos de planeación, **un pull
request por fase** con ramas encadenadas, autoría exclusivamente tuya, cero
emojis.

```bash
gh pr list --state open          # vacío antes de empezar el módulo
git switch main && git pull
git switch -c feature/catalog-fase-0 main
```

Y antes de abrir el pull request de cada fase:

```bash
git diff --stat main..HEAD       # sólo lo de esta fase
```

**Aviso especial para este módulo:** las promociones son dinero. Aplica la regla
5 de las convenciones sin excepción — ningún cambio del motor se mergea sin
prueba de integración. Es el módulo con más superficie de error aritmético de
todo el plan: nueve reglas que se combinan entre sí, tres tipos de descuento, y
un tope global bajo concurrencia.

---

## Fase 0 — Pendientes arrastrados

**0.1 — Dos verificaciones que no son código y llevan abiertas varios módulos.**
No las resuelvas; conviértelas en algo que no se pueda olvidar. Añade a la
sección de estado de `docs/PLAN-PRODUCCION.md` un apartado "Verificaciones
pendientes de infraestructura" con las dos:

- Envío SMTP contra un proveedor real, con SPF, DKIM y DMARC, comprobando que
  llega a Gmail sin caer en spam. Abierta desde el módulo 11.
- Impresión contra una impresora térmica física. El módulo 13 se verificó contra
  un emulador ESC/POS, que no reproduce el atasco de papel, la página de códigos
  real ni el corte.

Ninguna bloquea el desarrollo; las dos bloquean la instalación en un restaurante.

**0.2 — Limpieza de ramas fusionadas.**

---

## Fase 1 — Diseño (para y espera aprobación)

Tres superficies, y dos de ellas se usan en momentos opuestos.

**Existencias en el editor de platillos.** Es configuración: se toca una vez al
dar de alta el platillo. Enséñame cómo se ve un platillo **sin** inventario
—que es el caso común y no debe ganar ruido visual— y uno **con** inventario.

**Ajuste rápido de existencias.** Esto es operación, no configuración: pasa a
media comida, lo hace quien está en la cocina desde un celular, y abrir el
editor completo del platillo para cambiar un número es demasiado. Enséñame ese
gesto. Y enséñame cómo se avisa de que algo está por agotarse **sin** convertir
el panel en un semáforo de alarmas que nadie mira a la tercera semana.

**Promociones.** El formulario es el reto real del módulo: nueve reglas que se
combinan y que, mal presentadas, producen promociones que el dueño cree que
hacen una cosa y hacen otra. La pregunta que tiene que contestar el diseño no es
"cómo capturo nueve campos" sino **"cómo le digo al dueño, en una frase, qué va
a pasar con esta promoción"**. Una vista previa en lenguaje natural —"20% de
descuento, viernes a domingo de 18:00 a 22:00, en pedidos de más de $300, máximo
$100 de descuento"— vale más que la mitad de los campos.

Enséñame también la lista de promociones: cuáles están vigentes hoy, cuáles
caducaron, y cuántas veces se ha usado cada una.

Propón, enséñame y **para aquí**.

---

## Fase 2 — Inventario

**(a) Los campos que faltan.** `trackInventory` y `stockQuantity` en
`buildMenuItemSchema`, en el `ItemEditorDrawer` y en las dos acciones de crear y
actualizar. Es literalmente lo único que separa el módulo de funcionar.

**(b) Ajuste rápido** desde `ItemTable`, sin abrir el editor.

**(c) Aviso de existencias bajas.** Columna nueva `MenuItem.minStockQuantity Int
@default(0)`, y un aviso en el panel cuando se cruza hacia abajo. Cero significa
"no avisar", que es el comportamiento de siempre para todo lo que ya existe.

**(d) La bitácora, que es lo que hace confiable el número.** Hoy `stockQuantity`
es un entero sin historia: un pedido lo baja, una cancelación lo sube, un ajuste
manual lo mueve, y las tres cosas son indistinguibles. La primera pregunta que
hace alguien es "¿por qué tengo 3 si debería tener 12?", y sin bitácora no hay
respuesta.

```prisma
model StockMovement {
  id          String   @id @default(cuid())
  menuItemId  String
  /// Negativo al vender, positivo al reponer o al cancelar.
  delta       Int
  reason      StockMovementReason
  orderId     String?
  createdById String?
  note        String?
  createdAt   DateTime @default(now())
}

enum StockMovementReason { SALE CANCELLATION MANUAL_ADJUSTMENT RESTOCK WASTE }
```

**El movimiento se escribe dentro de la misma transacción que cambia
`stockQuantity`**, en los tres sitios que hoy lo tocan: el descuento de
`create-order.ts`, la devolución de `cancelOrderAction`, y el ajuste manual
nuevo. Mismo criterio que el outbox de notificaciones. Si el movimiento y el
número pueden divergir, la bitácora no sirve para nada.

**Alcance explícito, y dilo en la documentación comercial:** esto es inventario
**de platillos**, no de insumos. Descontar 200 gramos de harina por pizza son
recetas, escandallos, unidades de medida y mermas: otro producto. El Apéndice E
del plan ya lo excluye; que quede claro antes de que un cliente lo asuma.

---

## Fase 3 — El motor de promociones (para y pregúntame)

Aquí está la decisión del módulo, y son cuatro preguntas.

**1. El orden de las operaciones.** Hoy `create-order.ts` hace subtotal, luego
impuesto sobre el subtotal, luego total. Con descuento hay dos órdenes posibles
y producen números distintos:

- Descuento sobre el subtotal, impuesto sobre el subtotal ya descontado.
- Impuesto sobre el subtotal completo, descuento después sobre el total.

**El primero es el correcto** en México: el IVA se calcula sobre la base
gravable ya descontada. Pero quiero que lo confirmes, y sobre todo que lo
**escribas como comentario en el esquema o en el motor**, porque es exactamente
la clase de decisión que provoca una discusión con el contador del cliente
dentro de un año.

**2. `perUserLimit` con invitados.** El campo existe, pero este sistema permite
pedir **sin cuenta**: sólo hay `guestEmail` y `guestPhone`. ¿Contra qué se cuenta
el límite por usuario? ¿`customerId` cuando existe y correo cuando no? ¿Se
ignora el campo para invitados y se documenta? Mi inclinación es la segunda —un
límite que se evade cambiando de correo da una falsa sensación de control— pero
dime tú.

**3. El tope global bajo concurrencia.** `usageCount` contra `usageLimit` es
exactamente el mismo problema que el inventario, y la solución ya está en el
repositorio: un `updateMany` con el límite en el `where`, nunca leer y después
escribir. Confírmame que lo vas a hacer así.

**4. `OrderPromotion` tiene `@@unique([orderId, promotionId])` y `promotionId`
es nullable.** En Postgres dos filas con `promotionId` nulo **no** colisionan,
así que un mismo pedido podría acumular varias promociones "sueltas" sin que la
restricción lo note. ¿Es un problema real en tu diseño, o `promotionId` siempre
va lleno al crear? Contéstalo antes de escribir el motor.

### Cómo se construye

Módulo puro `lib/promotions/engine.ts`, con la misma disciplina que
`lib/reservations/availability.ts`: sin Prisma, sin `Date.now()` dentro, todo
por parámetro. Es lo que lo hace testeable sin base de datos y lo que permite
probar las nueve reglas combinadas sin montar un pedido entero.

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

La ventana horaria y los días de la semana se resuelven **en la zona del
negocio**, con los helpers que ya existen. Una promoción de viernes que se activa
el jueves a las 17:00 porque alguien usó UTC es un error caro y silencioso.

---

## Fase 4 — Enganchar las promociones al pedido

Con lo decidido:

- **CRUD en `/admin/promociones`**, y enciende `enabled: true` en el sidebar.
- **Enganche en `createOrderFromCart`**, dentro de la transacción que ya existe,
  entre el subtotal y el impuesto. Escribe `Order.discountTotal` y las filas de
  `OrderPromotion` con el descuento **congelado**, igual que los precios: un
  ticket de hace un año tiene que seguir explicando por qué cobró menos.
- **Captura de código en el checkout**, con el error claro cuando no aplica:
  "este código es de lunes a jueves", no "código inválido". Un código rechazado
  sin explicación es una llamada al restaurante.
- **Incremento atómico de `usageCount`**, según la respuesta a la pregunta 3.

**Las pruebas de esta fase no son negociables.** Una por tipo de descuento, una
por cada regla de vigencia, una por cada límite, una por la combinación de
varias promociones sobre el mismo pedido, y una de concurrencia sobre
`usageLimit`. Si alguna combinación te parece que no puede pasar, escríbela
igual: son las que pasan.

**Y una que importa más que las demás:** un pedido con promoción tiene que
cuadrar en el reporte de ventas del módulo 12. Subtotal menos descuento, más
impuesto, igual a total, y la suma del día igual a la suma manual. El módulo 12
puso esa prueba; este módulo no puede romperla.

---

## Fase 5 — Cierre

1. `graphify` y el generador.
2. Nota de bitácora en `Marea-Bitacora/14-Inventario-y-promociones.md`. La tabla
   de decisiones lleva las cuatro respuestas de la Fase 3, y en especial el orden
   de operaciones del impuesto.
3. Marca las casillas en `Grupo-1-Comida-Bebida.md` y actualiza la tabla de
   estado del plan.
4. Verificación de autoría y pull request. **Sin fusionar.**

---

## Reglas técnicas

Las de siempre. Cinco propias del módulo:

- **Todo descuento se congela al aplicarse.** `OrderPromotion.discountAmount` y
  `titleSnapshot` se guardan; no se recalculan nunca desde la promoción viva.
- **Ningún contador se lee y después se escribe.** Ni `stockQuantity` ni
  `usageCount`. El patrón atómico ya está en el repositorio: úsalo.
- **El motor es puro.** Sin Prisma, sin reloj interno, sin zona horaria
  implícita.
- **`Prisma.Decimal` hasta el último momento.** Un descuento porcentual
  calculado con `number` pierde centavos, y los centavos perdidos aparecen en el
  corte de caja del módulo 12.
- **Un movimiento de inventario por cada cambio de existencias**, en la misma
  transacción. Sin excepciones.

Dependencias nuevas: **ninguna autorizada.**

---

## Definición de terminado

- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` limpios, con la salida.
- [ ] CI en verde, cobertura dentro de umbral.
- [ ] Doy de alta un platillo con inventario, lo vendo, y las existencias bajan.
- [ ] Cancelo ese pedido y las existencias vuelven, con su movimiento registrado.
- [ ] La bitácora explica los tres casos: venta, cancelación y ajuste manual.
- [ ] Un platillo que llega a cero desaparece del menú público y vuelve al
      reponerlo.
- [ ] Dos checkouts concurrentes sobre la última unidad: uno pasa, el otro no, y
      el stock nunca queda negativo. Sigue habiendo prueba de esto.
- [ ] Cada tipo de promoción tiene prueba, y cada regla de vigencia también.
- [ ] Dos promociones sobre el mismo pedido dan el número que esperas, y está
      escrito cuál se aplica primero.
- [ ] Un `usageLimit` de 1 con dos pedidos concurrentes se respeta.
- [ ] Una promoción de fin de semana **no** se activa el jueves a las 23:00 en la
      zona del negocio. Pruébalo cambiando `Business.timezone`.
- [ ] Un pedido con promoción guarda su `OrderPromotion` y su `discountTotal`, y
      el ticket cuadra.
- [ ] **El reporte de ventas del módulo 12 sigue cuadrando al centavo** con
      pedidos que llevan descuento.
- [ ] Un código rechazado dice por qué.
- [ ] Un pull request por fase, todos con la plantilla llena, ninguno fusionado.
- [ ] Todo en inglés salvo los documentos de planeación.
- [ ] El grep de autoría devuelve vacío en todas las ramas.

---

## Lo que NO debes hacer

- **No construyas inventario de insumos.** Ni recetas, ni escandallos, ni
  unidades de medida, ni mermas por ingrediente. `WASTE` como razón de
  movimiento es todo lo que este módulo contempla.
- **No conectes las promociones al landing todavía.** La sección de ofertas
  sigue leyendo `content.ts` hasta el módulo 15, que es donde la landing entera
  pasa a la base. Aquí sólo se construye el motor y el panel.
- **No toques los testimonios.** Módulo 15.
- **No metas órdenes de compra ni proveedores.** Es un producto distinto.
- **No cambies la máquina de estados de pedidos ni la de pagos.**
- **No toques el SSE ni el polling.** Sigue siendo el módulo 16.
- **No retraduzcas** los documentos en español.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase.
`/security-review` en la Fase 4: un motor de descuentos mal acotado es una forma
de sacar dinero del negocio sin tocar el código.

**Dos paradas:** al final de la Fase 1 con el diseño —y quiero ver la vista
previa en lenguaje natural de la promoción—, y al final de la Fase 3 con las
cuatro respuestas. En lo demás avanza de corrido, abriendo el pull request de
cada fase antes de empezar la siguiente.
