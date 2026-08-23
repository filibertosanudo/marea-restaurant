# Marea — roles, permisos y alcance de la v1

Documento de producto. Responde la pregunta *"¿para qué necesitaría un empleado
loguearse?"* antes de escribir una sola pantalla.

---

## 1. El problema con "staff"

`STAFF` no es un puesto, son tres superficies distintas con necesidades opuestas:

| Superficie | Dispositivo | Sesión | Qué necesita ver |
|---|---|---|---|
| **Cocina (KDS)** | pantalla fija en la cocina | se loguea una vez y se queda meses | una sola cosa: los pedidos entrantes, en letra grande, sin menús ni navegación |
| **Mesero** | su propio celular, en el piso | entra y sale por turno | el mapa de mesas y el pedido de la mesa que está atendiendo |
| **Caja** | tablet o PC en el mostrador | por turno, con corte al final | cobros, "pagar en caja", reembolsos, cierre de turno |

Cada una es prácticamente una app aparte. Construir las tres es duplicar el
tamaño del proyecto — y ninguna es lo que hace interesante a Marea.

## 2. Por qué el empleado necesita identificarse (cuando lo necesita)

No es burocracia; hay tres razones concretas y todas son de dinero o de culpa:

1. **Atribución.** El pedido guarda `staffId`. Sin eso no puedes repartir
   propinas ni saber quién atendió la mesa 7 cuando el cliente se queja.
2. **Trazabilidad de lo destructivo.** `OrderStatusEvent.changedById` y
   `Refund.createdById` responden *quién canceló ese pedido de $400* y *quién
   autorizó ese reembolso*. Es la razón número uno por la que un restaurante
   real compra un POS con cuentas individuales.
3. **Corte de caja.** `Payment.collectedByUserId` es lo que hace que el dinero
   del cajón cuadre con el sistema al cerrar el turno.

Fíjate en lo que **no** está en esa lista: "ver el menú" o "tomar el pedido" no
requieren identidad. Por eso la cocina puede vivir con un dispositivo logueado
permanentemente y nadie sufre.

## 3. Recomendación de alcance para la v1

**Colapsa los tres puestos en uno.** `STAFF` recibe exactamente **una pantalla**:
el tablero de pedidos en tiempo real, que funciona igual de bien colgado en la
cocina que en el celular del mesero. Nada más.

El administrador hace todo lo demás — que es la verdad en un restaurante
pequeño, donde el dueño es también el gerente, el que cobra y el que sube las
fotos del menú.

Y el cliente **no necesita cuenta**: el esquema ya soporta pedido y reservación
como invitado (`guestName` / `guestEmail` / `guestPhone`, más
`confirmationCode` para consultar la reserva sin login). Obligar a registrarse
para pedir una langosta es la forma más rápida de perder el pedido. Las cuentas
de cliente valen la pena cuando quieras historial y favoritos — v2.

### Matriz de permisos v1

| Acción | Cliente (invitado) | STAFF | BUSINESS_ADMIN | SUPER_ADMIN |
|---|:--:|:--:|:--:|:--:|
| Ver menú, ordenar, reservar | ✅ | ✅ | ✅ | ✅ |
| Ver el tablero de pedidos | — | ✅ | ✅ | ✅ |
| Cambiar estado de un pedido | — | ✅ | ✅ | ✅ |
| Cancelar un pedido | — | — | ✅ | ✅ |
| Cobrar en caja | — | ✅ | ✅ | ✅ |
| Reembolsar | — | — | ✅ | ✅ |
| Editar menú, precios, fotos | — | — | ✅ | ✅ |
| Marcar un platillo como agotado | — | ✅ | ✅ | ✅ |
| Promociones | — | — | ✅ | ✅ |
| Mesas y códigos QR | — | — | ✅ | ✅ |
| Confirmar / asignar reservaciones | — | ✅ | ✅ | ✅ |
| Moderar testimonios | — | — | ✅ | ✅ |
| Reportes de venta | — | — | ✅ | ✅ |
| Dar de alta empleados | — | — | ✅ | ✅ |
| Configuración del negocio | — | — | ✅ | ✅ |
| Crear / suspender negocios | — | — | — | ✅ |

Dos renglones merecen explicación:

- **"Marcar un platillo como agotado" sí es de STAFF.** Es el único cambio al
  catálogo que ocurre en medio del servicio, lo hace quien está en la cocina, y
  no puede esperar a que el dueño abra la laptop. Es un toggle de
  `isAvailable`, no una edición del platillo.
- **Cancelar y reembolsar NO son de STAFF.** Son las dos acciones que mueven
  dinero hacia afuera. Que requieran al administrador es una decisión de
  control, no de desconfianza.

### Autenticación

Correo + contraseña para todo el personal, con `passwordHash` en `User`
(ya agregado al esquema). **Sin registro público**: el administrador crea las
cuentas de sus empleados desde el panel con una contraseña temporal y
`mustChangePassword = true`. Un restaurante no quiere que cualquiera se
registre como mesero.

`SUPER_ADMIN` es una bandera en `User.role` que salta el filtro por
`businessId`. En la v1 eres tú y no necesita ni una pantalla propia.

## 4. Orden de construcción propuesto

| # | Módulo | Por qué en ese lugar |
|---|---|---|
| **1** | **Auth + shell del panel + gestión de menú** | Es lo que apaga `content.ts`. Todo lo demás necesita un menú real en base de datos, y todas las pantallas siguientes reutilizan el shell. |
| 2 | Tablero de pedidos en tiempo real (STAFF) | La pieza más vistosa del portafolio y la que valida `OrderStatusEvent`. |
| 3 | Flujo del cliente: QR → menú → carrito → pedido | Cierra el circuito con el módulo 2. |
| 4 | Pagos con Stripe + pagar en caja | Necesita que exista un pedido real que cobrar. |
| 5 | Reservaciones (panel + público) | Independiente del resto; se puede adelantar si urge. |
| 6 | Promociones, testimonios, mesas/QR, reportes | Pantallas de mantenimiento, todas sobre el mismo shell. |

**Empezar por el dashboard con gráficas sería un error**: no hay datos que
graficar todavía, y una pantalla de KPIs sobre datos de seed es exactamente el
tipo de demo que se nota vacía. El dashboard va al final, cuando los módulos
2–4 ya generan números de verdad.
