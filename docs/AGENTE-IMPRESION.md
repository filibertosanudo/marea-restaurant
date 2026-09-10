# Instalar la impresora de cocina

Esta guía es para el dueño del restaurante, no para quien programó el
sistema. Si sabes conectar un router a internet, puedes seguirla completa.
No hace falta escribir código — sólo copiar y pegar unos comandos exactamente
como están escritos.

**Documento hermano, en inglés y para quien mantiene el código:**
[`agent/README.md`](../agent/README.md) explica cómo funciona el agente por
dentro. Este documento explica cómo instalarlo, nada más.

---

## Qué vas a necesitar

1. **Una impresora térmica de recibos, de red (con puerto Ethernet, no sólo
   USB).** Cualquier impresora ESC/POS de 80&nbsp;mm con conexión de red
   sirve — son las mismas que usan la mayoría de los sistemas de punto de
   venta en México. Si tu impresora sólo tiene USB, pregunta al vendedor por
   el modelo con "interfaz de red" o "Ethernet"; suelen costar poco más.
2. **Una computadora pequeña que se quede prendida todo el día**, dentro de
   la cocina o cerca de la caja. Dos opciones, de más barata a más cómoda:
   - Una **Raspberry Pi** (cuesta alrededor de $1,000 MXN con todo lo
     necesario). Es lo recomendado si no quieres usar una computadora que ya
     tengas para otra cosa.
   - **La misma computadora de la caja**, si ya tienes una prendida todo el
     día y no le vas a apagar la pantalla.
3. **Un cable de red (Ethernet)** para conectar la impresora al mismo router
   o switch que usa el restaurante. Si el router está lejos de la cocina,
   puede hacer falta un cable más largo o un punto de red adicional — pídele
   ayuda a quien te instaló el internet si no estás seguro.
4. Acceso al panel de administración de Marea (`/admin`) con una cuenta de
   `BUSINESS_ADMIN` — la misma con la que editas el menú.

**Nada de esto necesita saber programar.** Los pasos de instalación en la
computadora pequeña son los mismos, palabra por palabra, sin importar el
restaurante.

---

## Paso 1 — Conectar la impresora a la red

1. Conecta la impresora al router o switch del restaurante con el cable de
   red, y conéctala a la corriente.
2. La mayoría de las impresoras de red imprimen automáticamente una
   "página de configuración" o "página de prueba" si mantienes presionado
   el botón de alimentación de papel unos segundos al encenderla (revisa el
   manual de tu modelo — el botón exacto varía). Esa hoja trae la
   **dirección IP** de la impresora, algo como `192.168.1.50`. Anótala.
3. Si tu router lo permite, configúralo para que esa impresora **siempre
   reciba la misma dirección IP** (se llama "IP reservada" o "DHCP
   estático" en la configuración del router). Si no lo haces, la dirección
   puede cambiar sola después de un apagón, y la comanda dejaría de llegar
   hasta que vuelvas a configurar el agente. Si no sabes hacer esto, pídele
   a quien instaló tu internet que te ayude con este paso — es rápido para
   alguien que ya conoce el router.

---

## Paso 2 — Dar de alta el dispositivo en el panel

1. Entra a `/admin/configuracion` con tu cuenta de administrador.
2. Abre la pestaña **Dispositivos**.
3. Haz clic en **Nuevo dispositivo**, escribe un nombre como
   "Impresora cocina" y confirma.
4. Aparece un texto largo de letras y números — es el **token** del
   dispositivo. **Cópialo y guárdalo en algún lado seguro ahora mismo**: la
   pantalla no lo vuelve a mostrar. Si lo pierdes, no pasa nada grave — en
   la Fase 3 de más abajo puedes generar uno nuevo — pero tendrás que volver
   a hacer esa parte.

---

## Paso 3 — Preparar la computadora pequeña

Estos pasos son iguales para una Raspberry Pi o para la computadora de la
caja, siempre que tenga **Windows, macOS o Linux** con conexión a internet.

### 3.1 — Instalar Node.js

Node.js es el programa que hace correr el agente. Se descarga una sola vez.

1. Ve a [nodejs.org](https://nodejs.org) en esa computadora.
2. Descarga la versión marcada como **"LTS"** (es la recomendada, no la más
   nueva).
3. Instálala aceptando todas las opciones que vienen por defecto — no hay
   que cambiar nada.

### 3.2 — Copiar el agente a esa computadora

Pídele a quien te entregó el sistema el archivo comprimido del agente (la
carpeta `agent/` del proyecto), o descárgalo del repositorio. Descomprímelo
en un lugar fácil de encontrar, por ejemplo `C:\marea-agente` en Windows o
`/home/pi/marea-agente` en una Raspberry Pi.

### 3.3 — Abrir una terminal en esa carpeta

- **Windows:** abre la carpeta en el Explorador de archivos, escribe `cmd`
  en la barra de direcciones (donde dice la ruta) y presiona Enter.
- **macOS:** abre la app "Terminal", escribe `cd ` (con un espacio después),
  arrastra la carpeta del agente a la ventana, y presiona Enter.
- **Raspberry Pi / Linux:** igual que macOS, con la app "Terminal".

### 3.4 — Instalar y configurar

Copia y pega estos comandos, uno a la vez, presionando Enter después de
cada uno:

```bash
npm install
npm run build
```

Espera a que cada uno termine (puede tardar uno o dos minutos la primera
vez) antes de escribir el siguiente.

Ahora hay que decirle al agente tres cosas: dónde está el sistema en
internet, cuál es su token, y cuál es la dirección de la impresora.

1. Busca el archivo `.env.example` dentro de la carpeta del agente y haz
   una copia llamada `.env` (sin el `.example`).
2. Ábrelo con el Bloc de notas (Windows) o TextEdit (Mac) y completa estas
   cuatro líneas con tus propios datos:

```
SERVER_URL=https://tu-restaurante.com
DEVICE_TOKEN=el-token-que-copiaste-en-el-paso-2
PRINTER_HOST=192.168.1.50
PRINTER_PORT=9100
```

- `SERVER_URL` es la dirección de tu sistema Marea, la misma que usas para
  entrar al panel — sin `/admin` al final.
- `DEVICE_TOKEN` es el texto largo del Paso 2.
- `PRINTER_HOST` es la dirección IP que anotaste en el Paso 1.
- `PRINTER_PORT` casi siempre es `9100` — no lo cambies salvo que el manual
  de tu impresora diga otra cosa.

3. Guarda el archivo.

### 3.5 — Encenderlo

```bash
npm start
```

Si todo está bien, la terminal muestra una línea que dice algo como
`[print-agent] started`. **Deja esa ventana abierta** — si la cierras, el
agente se detiene y las comandas dejan de imprimirse (los pedidos se
siguen aceptando bien, sólo se acumulan esperando a que lo vuelvas a
prender; en cuanto lo prendas, salen todas).

---

## Paso 4 — Probarlo

1. Desde tu celular, escanea el código QR de una mesa como si fueras un
   cliente y haz un pedido de prueba.
2. En unos segundos, la impresora de la cocina debería sacar la comanda
   sola, sin que nadie toque nada.
3. Entra a `/admin/configuracion` → Dispositivos: tu impresora debe decir
   **"En línea"** en verde.

Si la comanda no sale, revisa la sección de abajo.

---

## Que se quede prendido siempre

Una vez que funciona, quieres que el agente arranque solo si la computadora
se reinicia o hay un corte de luz, sin que nadie tenga que volver a escribir
`npm start` a mano.

- **Windows:** la forma más simple es agregar un acceso directo al comando
  `npm start` (dentro de la carpeta del agente) a la carpeta de "Inicio" de
  Windows, para que se abra solo al prender la computadora.
- **Raspberry Pi / Linux:** pídele a quien te entregó el sistema que
  configure un "servicio de systemd" — es una tarea de cinco minutos para
  alguien con experiencia en Linux, pero requiere escribir un archivo de
  configuración que no vale la pena copiar a mano sin esa experiencia.

En cualquiera de los dos casos, esto se configura **una sola vez**.

---

## Si algo no funciona

**La comanda no sale y el dispositivo dice "Sin conexión" en el panel.**
El agente no está corriendo, o no tiene internet. Revisa que la ventana de
la terminal siga abierta y sin errores en rojo.

**El dispositivo dice "En línea" pero la comanda no sale.**
Revisa que `PRINTER_HOST` en el archivo `.env` sea la dirección correcta de
la impresora, y que la impresora tenga papel y esté encendida. Reinicia el
agente (cierra la terminal y vuelve a correr `npm start`) después de
corregir cualquier dato.

**La comanda sale con letras raras en los acentos o las eñes.**
Esto no debería pasar — el agente ya selecciona la página de códigos
correcta automáticamente. Si pasa, es un modelo de impresora distinto al
que se probó; guarda una foto del ticket y repórtalo a quien mantiene el
sistema.

**Perdiste el token del dispositivo.**
Entra a Configuración → Dispositivos, y usa "Rotar token" sobre esa
impresora — te da uno nuevo. Copia el nuevo token al archivo `.env` (Paso
3.4) y reinicia el agente.

**Cambiaste de impresora o le cambiaste la dirección IP.**
Sólo hace falta editar `PRINTER_HOST` en el archivo `.env` y reiniciar el
agente — no hace falta tocar nada en el panel.
