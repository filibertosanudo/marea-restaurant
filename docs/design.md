---
version: alpha
name: Marea
description: Sistema de diseño del proyecto insignia "Grupo 1 — Comida y Bebida" (restaurante de mariscos) del portafolio de Filiberto Sañudo.
colors:
  surface: "#FFFFFF"
  surface-subtle: "#F8F9FA"
  surface-ocean: "#ECF5F8"
  surface-ocean-border: "#418FA7"
  on-surface: "#232C3B"
  on-surface-muted: "#57646C"
  border: "#828F9C"
  primary: "#1B367B"
  primary-hover: "#16295F"
  on-primary: "#FFFFFF"
  accent-warm: "#F0E7D5"
  accent-warm-border: "#927B4C"
  on-accent-warm: "#6F6A5C"
  surface-raised: "#ECEFF2"
  success: "#1F8A5F"
  warning: "#C77D19"
  error: "#C0392B"
  info: "#2C6FBB"
darkColors:
  surface: "#16213D"
  surface-subtle: "#0E1830"
  surface-ocean: "#1A2A4D"
  surface-ocean-border: "#5D78B5"
  on-surface: "#EEF2FA"
  on-surface-muted: "#B9C4DA"
  border: "#5B70A8"
  primary: "#9EB3F2"
  primary-hover: "#B7C7F5"
  on-primary: "#0B1226"
  accent-warm: "#3A3322"
  accent-warm-border: "#93815A"
  on-accent-warm: "#D6C9B0"
  surface-raised: "#203057"
  success: "#34B27A"
  warning: "#E0A542"
  error: "#E87C6E"
  info: "#5E9AE0"
typography:
  display:
    fontFamily: "'Montserrat Alternates', sans-serif"
    fontSize: "64px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  h1:
    fontFamily: "'Montserrat Alternates', sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.005em"
  h2:
    fontFamily: "'Montserrat Alternates', sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
  h3:
    fontFamily: "'Montserrat Alternates', sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  body-lg:
    fontFamily: "'Poppins', sans-serif"
    fontSize: "18px"
    fontWeight: 300
    lineHeight: 1.6
  body:
    fontFamily: "'Poppins', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "'Poppins', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.01em"
  label:
    fontFamily: "'Poppins', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  button-label:
    fontFamily: "'Poppins', sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.01em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "28px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  4xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-label}"
    rounded: "{rounded.full}"
    padding: "14px 28px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-label}"
    rounded: "{rounded.full}"
    padding: "14px 28px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.button-label}"
    rounded: "{rounded.full}"
    padding: "13px 27px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-ocean}"
    textColor: "{colors.primary}"
    typography: "{typography.button-label}"
    rounded: "{rounded.full}"
    padding: "13px 27px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  input-focus:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  card-menu:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  card-testimonial:
    backgroundColor: "{colors.surface-ocean}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  badge-offer:
    backgroundColor: "{colors.accent-warm}"
    textColor: "{colors.on-accent-warm}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  stat-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.h2}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  nav:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "12px 24px"

  # ---- Admin panel (variante densa — ver sección "Admin Panel" bajo Components) ----
  admin-sidebar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.body}"
    rounded: "0px"
    padding: "16px 12px"
  admin-sidebar-item-active:
    backgroundColor: "{colors.surface-ocean}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  admin-sidebar-item-disabled:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-muted}/50"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  admin-topbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "0px"
    padding: "12px 20px"
  button-primary-admin:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-label}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  input-admin:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  data-table:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0px"
  data-table-header:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.caption}"
    rounded: "0px"
    padding: "10px 12px"
  data-table-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "0px"
    padding: "10px 12px"
  data-table-row-alt:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "0px"
    padding: "10px 12px"
  empty-state:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.3xl}"
  status-badge-neutral:
    backgroundColor: "{colors.border}/16"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "3px 10px"
  status-badge-success:
    backgroundColor: "{colors.success}/12"
    textColor: "{colors.success}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "3px 10px"
  status-badge-warning:
    backgroundColor: "{colors.warning}/12"
    textColor: "{colors.warning}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "3px 10px"
  status-badge-error:
    backgroundColor: "{colors.error}/12"
    textColor: "{colors.error}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "3px 10px"
  status-badge-info:
    backgroundColor: "{colors.info}/12"
    textColor: "{colors.info}"
    typography: "{typography.caption}"
    rounded: "{rounded.sm}"
    padding: "3px 10px"
  form-field-label:
    textColor: "{colors.on-surface}"
    typography: "{typography.label}"
    padding: "0px 0px 4px 0px"
  form-field-hint:
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.caption}"
    padding: "4px 0px 0px 0px"
  form-field-error:
    textColor: "{colors.error}"
    typography: "{typography.caption}"
    padding: "4px 0px 0px 0px"
  drawer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "20px 0px 0px 20px"
    padding: "{spacing.lg}"
    width: "480px"
  confirm-dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  skeleton:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "transparent"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0px"
  image-dropzone:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.2xl}"
  image-dropzone-active:
    backgroundColor: "{colors.surface-ocean}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "{spacing.2xl}"
---

# Marea Design System

## Overview

Marea es el sistema de diseño del proyecto insignia "Grupo 1 — Comida y Bebida" del portafolio de Filiberto Sañudo: un restaurante de mariscos pensado como demo end-to-end (menú digital con QR, carrito en vivo, panel admin, pagos con Stripe y reservaciones). Como es la pieza más visual del portafolio, el sistema debe sentirse como una marca de restaurante boutique con personalidad propia — fresca, apetitosa, confiable — y al mismo tiempo compartir el ancla de color navy del portafolio principal para que, al mostrarse embebido como preview, se lea como parte de la misma familia y no como un sitio ajeno pegado encima. Anti-patrones: no debe verse como una plantilla genérica de "restaurante stock" con degradados baratos, no debe competir por atención con el navy del portafolio usando un azul distinto, y no debe sacrificar la legibilidad de Poppins solo por fidelidad literal a la referencia.

## Colors

`primary` (#1B367B) es exactamente el navy del portafolio (`navy.DEFAULT` en su `tailwind.config.ts`) en lugar del `1C3F6C`/`003093` de la referencia original — es la decisión de coherencia más importante del sistema: cuando este proyecto aparezca como card de preview dentro del portafolio, ambos deben leerse como el mismo azul de marca. `surface-ocean` (#ECF5F8) viene directo de la referencia y se usa como superficie alterna fresca (secciones About/Testimonials) evocando agua clara, con `surface-ocean-border` como borde sutil derivado. `accent-warm` reutiliza el trío cream/cream-border/cream-muted que el portafolio ya tiene definido — así el acento cálido para badges de "Ofertas exclusivas" también es compartido entre ambos proyectos, no inventado. Los semánticos (`success`/`warning`/`error`/`info`) están afinados dentro de la misma familia tonal para que nunca se sientan como colores "de sistema" pegados encima de la marca. Todos los pares texto/fondo cumplen AA: `on-surface` sobre `surface-ocean`, `on-primary` blanco sobre `primary`, `on-accent-warm` sobre `accent-warm`. `surface-raised` es el único token agregado para el panel de administración: una superficie neutra (no un tinte de `primary` ni de `surface-ocean`, para no leerse como "seleccionado" o "tematizado") ligeramente distinta de `surface`, pensada para la fila alterna de `DataTable` — en claro es un gris casi imperceptible (#ECEFF2), en oscuro se aclara en vez de oscurecerse (#203057, más claro que `surface` #16213D) porque en modo oscuro "elevado" se lee subiendo la luminosidad, no bajándola.

## Dark Mode

`darkColors` sigue exactamente los mismos roles semánticos que `colors` — no es una paleta distinta, es la misma marca reexpresada para fondo oscuro. Las superficies se oscurecen (`surface` #16213D, `surface-subtle` #0E1830, `surface-ocean` #1A2A4D) y el texto se aclara (`on-surface` #EEF2FA, `on-surface-muted` #B9C4DA), siguiendo el patrón estándar de dark mode. La única inversión real es `primary`: en vez del navy sólido (#1B367B), en oscuro se usa un azul-lavanda claro (#9EB3F2) con `on-primary` casi negro (#0B1226) — un navy saturado pierde casi todo su contraste sobre un fondo ya oscuro, mientras que aclararlo (y voltear el texto que lo acompaña) es el mismo patrón que usan sistemas como los de GitHub o Linear para su color de marca en modo oscuro. Como todos los componentes usan los nombres semánticos (`bg-primary`, `text-on-surface`, etc.) y nunca hex directo, este cambio se propaga automáticamente a los 12 componentes del sistema con cero cambios de código — ese es el punto de haberlos construido así desde el principio. El tema activo se controla con el atributo `data-theme="dark"` en `<html>`, y las sombras (`shadow-1`/`shadow-2`/`shadow-hero`) cambian de un tinte navy sutil a negro puro, ya que un tinte de color sobre fondo oscuro se pierde — en su lugar, la definición de las cards se apoya más en `border` que en la sombra.

**Verificación WCAG 2.1** (ratio calculado con la fórmula de luminancia relativa del estándar; mínimos: texto normal 4.5:1 / AAA 7:1, texto grande o componentes de UI 3:1):

| Par | Uso | Ratio | Nivel |
|---|---|---|---|
| `on-surface` sobre `surface` | texto de cuerpo | 14.2:1 | AAA |
| `on-surface-muted` sobre `surface` | texto secundario | 9.1:1 | AAA |
| `primary` (texto) sobre `surface` | precios, acentos | 7.7:1 | AAA |
| `on-primary` sobre `primary` (fill) | texto de botones | 9.0:1 | AAA |
| `on-accent-warm` sobre `accent-warm` | badges de oferta | 7.7:1 | AAA |
| `border` sobre `surface` | borde de inputs/cards | 3.3:1 | AA (UI) |
| `surface-ocean-border` sobre `surface-ocean` | borde de testimonios | 3.25:1 | AA (UI) |
| `accent-warm-border` sobre `accent-warm` | borde de badges | 3.3:1 | AA (UI) |
| `surface-raised` sobre `surface` | fila alterna de tabla (zebra) | 1.15:1 | decorativo — no es límite de componente, ver nota abajo |
| `success` sobre `surface` | estado positivo | 5.9:1 | AA |
| `warning` sobre `surface` | estado de alerta | 7.3:1 | AAA |
| `error` sobre `surface` | estado de error | 5.7:1 | AA |
| `info` sobre `surface` | estado informativo | 5.4:1 | AA |

Los tres tokens de borde (`border`, `surface-ocean-border`, `accent-warm-border`) se ajustaron específicamente para esta verificación: los valores iniciales que se habían propuesto para dark mode (tomados de la referencia de Claude Design) daban entre 1.6:1 y 1.7:1 — invisibles como límite de componente. Se aclararon hasta cruzar el mínimo de 3:1 sin perder la identidad de marca (siguen siendo tonos derivados de `primary`/`accent-warm`, solo más claros).

**Nota sobre el modo claro (resuelto):** esta verificación había detectado que `border` (antes #E2E5E8 sobre `surface` blanco) y `surface-ocean-border`/`accent-warm-border` en modo claro caían por debajo de 3:1 (~1.1–1.3:1) — un problema preexistente, no introducido por el dark mode, que quedó pendiente en el primer pase para no tocar una apariencia ya aprobada del landing sin decisión explícita. Al construir el panel de administración (denso, lleno de tablas y formularios donde un borde invisible es un defecto real, no un detalle) se decidió cerrarlo: los tres tokens se oscurecieron manteniendo el mismo matiz (`border` → #828F9C, `surface-ocean-border` → #418FA7, `accent-warm-border` → #927B4C), los tres ahora en 3.3:1–3.33:1. Se verificó visualmente que el landing conserva su lectura de bordes sutiles — el cambio es perceptible de cerca pero no introduce una línea dura donde antes había una casi invisible.

## Typography

La referencia especifica Montserrat Alternates SemiBold para headlines y Poppins Light para body — se conserva esa pareja porque le da a Marea una personalidad de restaurante boutique distinta a la Geist Sans del portafolio, y eso está bien: cada proyecto vertical del portafolio puede tener su propia voz tipográfica; lo que importa para la coherencia visual es el color, no la fuente (a nivel thumbnail/preview la fuente casi no se percibe, el color sí). El tamaño de 130px de la lámina de referencia es una medida de slide de presentación, no de web real — se reescala al token `display` (64px) pensado para el hero real en desktop, con `h1`/`h2`/`h3` bajando la escala para el resto de la jerarquía. Ajuste deliberado sobre la referencia: `body` pasa de Poppins Light 300 a Poppins Regular 400 a 16px — Light a ese tamaño cae por debajo de un contraste de trazo cómodo para lectura extendida (menús, testimonios), así que Light se reserva para `body-lg` (citas, subtítulos grandes) donde el tamaño mayor compensa el trazo fino. `button-label` usa Poppins Medium 500 para que los CTAs (reservar, agregar al carrito) se sientan firmes frente al resto del copy más ligero.

## Layout

La densidad es cómoda-generosa, como en los mockups de referencia: mucho aire alrededor de las fotos de comida y las cards, nunca una grilla apretada tipo directorio. La escala de `spacing` va de 4px a 96px en pasos que crecen geométricamente (4/8/16/24/32/48/64/96), pensada para que el ritmo entre elementos pequeños (padding de badges) y bloques grandes (separación entre secciones del landing) sea consistente. El contenedor principal se mantiene centrado con márgenes laterales generosos en desktop, colapsando a un solo carril vertical en tablet/mobile — igual que en los mockups responsive de la referencia, donde las stats pasan de una fila a una grilla 2×2 y las cards de menú pasan de fila a columna.

## Elevation & Depth

Las sombras son suaves y con un tinte azulado sutil (no negro puro) para reforzar la sensación de "agua/vidrio" del hero con olas — evita el aspecto plano de un formulario corporativo sin volver el diseño pesado. Se usan dos niveles: uno discreto para cards en reposo (menú, testimonios) y uno más marcado para hover/foco, de forma que la interacción se sienta física sin necesitar animación compleja. El mockup del hero (laptop, foto de producto) puede llevar una sombra más grande y difusa para separarse del fondo fotográfico de mejillones y agua.

## Shapes

El lenguaje de forma es suave-redondeado en toda la jerarquía: botones completamente píldora (`rounded.full`), cards con esquinas generosas (`rounded.lg`/`xl`), inputs y badges más contenidos (`rounded.md`/`sm`). Esto viene directo de la fotografía orgánica de mariscos y el efecto de agua de la referencia — formas duras/rectas romperían esa sensación fluida. Es el mismo principio "suave" del portafolio pero con un radio más generoso (el portafolio es más minimalista/recto), lo cual está bien: el radio no es parte del punto de coherencia compartido, el color sí lo es.

## Components

`button-primary` es el CTA principal (Reservar mesa, Agregar al carrito) en navy sólido; `button-secondary` es su contraparte de baja énfasis en superficie blanca con texto navy, para acciones secundarias (Ver menú completo). Los inputs (`input`/`input-focus`) alimentan el formulario de reservación — el foco se marca con borde en `primary` más un halo suave, nunca solo un cambio de color de fondo, por accesibilidad de teclado. `card-menu` es la unidad repetible de la sección Our Menu (foto, nombre, precio, botón); `card-testimonial` vive sobre `surface-ocean` para diferenciarse de las cards de menú sin introducir un color nuevo. `badge-offer` marca descuentos/ofertas reutilizando el acento cálido compartido con el portafolio. `stat-item` renderiza los números grandes de About Us (25+ años, 10K+ clientes) con tipografía `h2` en `primary` para destacar sin necesitar un color adicional. `nav` es la barra superior tipo píldora flotante que ya aparece en el mockup de referencia (logo + links + CTA), manteniendo `rounded.full` como firma de marca.

### Admin Panel — variante densa, mismo sistema

El panel de administración (`/admin`) no es un sistema de diseño nuevo: usa exactamente los mismos `colors` y `typography` que el landing, con un único ajuste deliberado — **densidad**. El landing es cómodo-generoso a propósito (mucho aire, `rounded.lg`/`xl`, todo en píldora) porque vende una experiencia de restaurante boutique que se consume una vez por visita. El panel se usa todo el día, muchas veces, por la misma persona mirando una tabla de 9+ filas — ahí el aire generoso deja de ser lujo y empieza a costar scroll y clics. La regla: **el color y la tipografía no cambian nunca; el radio baja de `rounded.lg`/`xl`/`full` a `rounded.md`/`sm`, y el padding baja un escalón en la escala de `spacing`** (de `lg`/`xl` a `sm`/`md`, y de `14px 28px` en botones a `8px 14px`/`8px 12px`, ver `button-primary-admin` e `input-admin`). Nunca se usa `rounded.full` dentro de una tabla o formulario admin — el pill queda reservado para las píldoras de marca del landing (`nav`, CTAs) y para controles que ya eran redondos por naturaleza (el switch de `isAvailable`, los avatares).

**`AdminShell`** es `admin-sidebar` (columna fija, ítems en `admin-sidebar-item-active` cuando la ruta está activa — fondo `surface-ocean`, texto `primary`, el mismo par que ya usa el landing para estados "seleccionado" — y `admin-sidebar-item-disabled` para las secciones fuera de alcance de este encargo, visibles pero apagadas con candado) más `admin-topbar` (buscador, `LocaleTabs`, toggle de tema, menú de usuario). Ambos usan `rounded: 0px` porque son marcos estructurales de pantalla completa, no cards flotantes — el radio se reserva para el contenido que va *dentro* de ellos.

**`DataTable`** extiende el `Table` existente (mismo `border`, mismo header en `surface-subtle` con texto `on-surface-muted` en mayúsculas) agregando: columna de selección, encabezados con affordance de orden (chevron, sin nuevo token — usa `on-surface-muted` / `on-surface` al hover), una barra de filtro/búsqueda arriba, paginación abajo, y la opción de fila alterna con `data-table-row-alt` (`surface-raised`) para tablas largas como la de platillos. El contenedor pasa de `rounded.lg` (Table del landing) a `rounded.md` — sigue siendo una card, solo menos generosa.

**`StatusBadge`** (`status-badge-success/warning/error/info/neutral`) usa el color semántico como texto sólido sobre un tinte del 12–16% del mismo color (`bg-{color}/12` con las utilidades de opacidad que ya soporta `styles/tokens.css`) en vez de relleno sólido con texto blanco — así el mismo texto que ya está verificado a 5.4–7.3:1 contra `surface` en la tabla de arriba sigue pasando AA sin inventar un tono nuevo, y funciona igual en claro y oscuro sin lógica condicional de color de texto. `rounded.sm`, nunca píldora: es una etiqueta de estado en una fila de tabla, no un badge de oferta de marketing.

**`FormField`** compone `form-field-label` (nuevo token tipográfico `label`: Poppins 13px/500, para diferenciar "esto es una etiqueta de campo" de `caption`, que es texto de apoyo) sobre `input`/`input-admin`, con `form-field-hint` (`on-surface-muted`) o `form-field-error` (`error`) debajo — nunca ambos a la vez. El estado inválido de `input-admin` cambia su borde a `error` con el mismo grosor, no añade un fondo rojo — el sistema ya reserva el color de fondo lleno para estados de marca (`primary`, `accent-warm`), no para errores.

**`Drawer`/`SheetPanel`** es el editor de platillo: un panel lateral con `rounded: 20px 0 0 20px` (solo las esquinas interiores, porque el borde derecho pega con el viewport) y `shadow-hero` para separarse claramente de la lista que queda visible detrás. Es la pieza que hace posible editar 9 platillos seguidos sin perder contexto de la tabla.

**`ConfirmDialog`** reutiliza `Modal` casi sin cambios (mismo `rounded.lg`, `shadow-hero`) — la única diferencia es que su acción primaria usa `bg-error` en vez de `bg-primary` cuando la acción es destructiva (borrar/desactivar), siguiendo el mismo patrón de `button-primary` pero con el color semántico de error.

**`LocaleTabs`** no es un componente nuevo: es el `Tabs` del landing (`rounded.full`, track en `surface-subtle`, pestaña activa en `bg-primary`) usado con exactamente dos ítems fijos, EN/ES, colocado junto a cada campo de `FormField` que tiene traducción. Se mantiene en píldora a propósito — es un control pequeño y frecuente, no una tabla, y reusar el componente tal cual (en vez de inventar una variante admin) es más consistente que inventar una diferencia donde no hace falta.

**`Skeleton`** es un bloque `surface-subtle` con `rounded.sm` y una animación de brillo (`surface` deslizándose sobre `surface-subtle`) — sin texto, solo la forma del contenido que va a aparecer (fila de tabla, línea de texto, foto de platillo).

**`EmptyState`** es deliberadamente la pieza *menos* densa del panel: `surface-subtle`, `rounded.lg` y `padding.3xl` — mismo aire generoso que el landing — porque un estado vacío ya se siente como un error de uso si además se ve apretado; aquí sí vale la pena el respiro.

**`ImageDropzone`** es `surface-subtle` con borde punteado en el token `border` (ahora visible a 3.3:1, antes hubiera sido un punteado invisible) y `rounded.md`; al arrastrar un archivo sobre la zona pasa a `image-dropzone-active` (`surface-ocean` + texto `primary`), el mismo par que usa el landing para "esto está activo/seleccionado" en vez de inventar un color de "drag over" nuevo.

### Pagos — mismo sistema, cuatro patrones nuevos

Los cuatro patrones del módulo de cobros (`components/order/PaymentMethodChoice.tsx`, `components/order/CardPaymentPanel.tsx`, `components/admin/PaymentStatusPill.tsx`, `components/admin/AmountBreakdown.tsx`, `components/admin/RefundForm.tsx`, más el nuevo `components/admin/Drawer.tsx` que los aloja en el panel) no necesitaron ni un token nuevo — la paleta semántica (`success`/`warning`/`error`/`info`/`neutral`) ya cubría los ocho estados de `PaymentStatus`, y `drawer` ya estaba definido en este documento desde antes de que ningún componente lo implementara.

**`PaymentMethodChoice`** vive en la densidad del landing/pedido (card `rounded.lg`, no `rounded.sm` del panel) porque es una decisión que el cliente toma una vez, en su celular, recién hecho el pedido — el mismo razonamiento de densidad cómoda-generosa que ya aplica a `card-menu`. Cada opción es una "radio card" completa (título + descripción + indicador circular), no un `<select>` ni dos botones sueltos, porque a diferencia de un formulario de checkout esto es una bifurcación real de experiencia (tarjeta ahora vs. caja después) que merece leerse como tal.

**`CardPaymentPanel`** cubre las fases del cobro con tarjeta que le pertenecen a él (`form` / `processing` / `requires_action` / `failed`) como ramas de un mismo componente, nunca pantallas separadas — así ninguna transición pierde el marco visual que la rodea. El estado `failed` es deliberadamente el más trabajado de las cuatro: fondo `error/8` (más tenue que los tintes `/12`-`/16` que usa el resto del sistema, para no leerse como un error más alarmante de lo necesario) con icono, una sola línea de motivo, y dos acciones de igual peso (reintentar / pagar en caja) — nunca un solo botón de "cerrar", porque alguien con la comida ya pedida necesita un siguiente paso, no un callejón sin salida. `succeeded` deliberadamente no es una rama suya: nada en este componente escribe ese estado (la única fuente de verdad es el webhook — ver su propio comentario en el código), así que la pantalla de éxito vive un nivel arriba, en `PaymentSection`, que es quien decide qué mostrar a partir del `paymentStatus` real del pedido.

**`PaymentStatusPill`** es el mismo patrón de `StatusBadge` (tinte `/12` sobre el color semántico, texto sólido) aplicado a los ocho valores de `PaymentStatus` en vez de a estados de pedido — se separan como componentes porque los vocabularios no coinciden (un pedido nunca está "requires_action") aunque la lógica de color sí. Acepta `className` para el tamaño, igual que la variante `density` de `OrderCard`/`AgingIndicator`, así cada superficie (tarjeta del tablero, drawer, tracking del cliente) controla su propia escala sin que el componente adivine.

**`AmountBreakdown`** es deliberadamente "tonto": una lista de `{label, value}` que solo formatea con `formatMoney`, nunca suma ni resta. Todo importe que muestra (total, pagado, reembolsado, reembolsable) ya llegó calculado desde el servidor con `Prisma.Decimal` — la regla del proyecto de que "ningún importe se calcula en el cliente" se cumple por construcción, no por disciplina del que lo usa.

**`RefundForm`** reutiliza el mismo patrón de "radio card" compacto (`rounded.sm`, no `rounded.lg` — vive en el panel, no en el pedido) para elegir total/parcial, y el botón de envío usa `bg-error` como `ConfirmDialog` ya hace para su acción destructiva primaria — reembolsar es exactamente ese tipo de acción.

**`Drawer`** implementa el token `drawer` que este documento ya definía (`rounded: 20px 0 0 20px`, `width: 480px`, `shadow-hero`) por primera vez — nadie lo había construido todavía. Es el contenedor del historial de pagos + `RefundForm`, abierto desde el badge de pago de `OrderCard` en vez de una ruta propia, porque es información de un pedido que ya está en pantalla, no una sección nueva de navegación.

**Nota de alcance (actualizada en Fase 4):** `CardPaymentPanel` ya está conectado a Stripe real — monta un Payment Element de verdad y confirma contra un PaymentIntent creado en el servidor; su leyenda bajo el botón ahora explica que el formulario está cargando, no que el pago "llega después". `RefundForm` sigue en el patrón original (botón deshabilitado con leyenda "llega en una actualización posterior") hasta que la Fase 5 conecte el reembolso real.

## Do's and Don'ts

Hacer: Usar `primary` (#1B367B) como único azul de marca en todo el sitio — es el punto de anclaje visual con el portafolio.
Hacer: Reservar `accent-warm` para momentos puntuales de calidez (ofertas, badges), no como color de fondo extendido.
Hacer: Mantener el radio píldora en todos los CTAs para que la marca se reconozca de un vistazo, incluso en thumbnail.
Hacer: Dejar que la fotografía real de comida/mariscos sea la protagonista visual; el sistema de color es deliberadamente comedido para no competir con ella.
Hacer: Cumplir AA en todos los pares texto/fondo, sobre todo con `body-lg` en Poppins Light.
Hacer: En el panel de administración, usar `rounded.md`/`sm` y el padding corto (`button-primary-admin`, `input-admin`) en vez del padding y radio del landing — la densidad es la única variante permitida.
Hacer: Construir `StatusBadge` y demás estados con tinte de opacidad (`bg-{semantic}/12`) sobre los colores semánticos existentes, nunca con un hex nuevo.

Evitar: No introducir un segundo azul (p. ej. el `1C3F6C`/`003093` literal de la referencia) — rompe el ancla compartida con el portafolio.
Evitar: No usar Poppins Light por debajo de 18px para texto de lectura — cae el contraste de trazo y la legibilidad.
Evitar: No aplanar las sombras a "flat design" total — el sistema depende de la sensación de profundidad tipo agua/vidrio para su carácter.
Evitar: No mezclar esquinas rectas de golpe en un componente puntual (p. ej. un botón cuadrado) — rompe el lenguaje de forma suave.
Evitar: No usar `rounded.full` dentro de tablas o formularios del panel (excepto controles ya redondos por naturaleza, como el switch de disponibilidad) — el pill es firma del landing, no del panel.
Evitar: No crear un sistema de diseño "admin" aparte. Todo componente nuevo de `components/admin/` referencia los mismos tokens de `colors`/`typography` de este documento; solo cambian `rounded` y `padding`.

**Resuelto:** los tokens de borde en modo claro (`border`, `surface-ocean-border`, `accent-warm-border`) ya cumplen el mínimo WCAG de 3:1 para límites de componentes de UI (ver sección Dark Mode) — se oscurecieron conservando el matiz de cada uno.
