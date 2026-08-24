---
version: alpha
name: Marea
description: Sistema de diseño del proyecto insignia "Grupo 1 — Comida y Bebida" (restaurante de mariscos) del portafolio de Filiberto Sañudo.
colors:
  surface: "#FFFFFF"
  surface-subtle: "#F8F9FA"
  surface-ocean: "#ECF5F8"
  surface-ocean-border: "#D6E9EF"
  on-surface: "#232C3B"
  on-surface-muted: "#57646C"
  border: "#E2E5E8"
  primary: "#1B367B"
  primary-hover: "#16295F"
  on-primary: "#FFFFFF"
  accent-warm: "#F0E7D5"
  accent-warm-border: "#D8CCB4"
  on-accent-warm: "#6F6A5C"
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
---

# Marea Design System

## Overview

Marea es el sistema de diseño del proyecto insignia "Grupo 1 — Comida y Bebida" del portafolio de Filiberto Sañudo: un restaurante de mariscos pensado como demo end-to-end (menú digital con QR, carrito en vivo, panel admin, pagos con Stripe y reservaciones). Como es la pieza más visual del portafolio, el sistema debe sentirse como una marca de restaurante boutique con personalidad propia — fresca, apetitosa, confiable — y al mismo tiempo compartir el ancla de color navy del portafolio principal para que, al mostrarse embebido como preview, se lea como parte de la misma familia y no como un sitio ajeno pegado encima. Anti-patrones: no debe verse como una plantilla genérica de "restaurante stock" con degradados baratos, no debe competir por atención con el navy del portafolio usando un azul distinto, y no debe sacrificar la legibilidad de Poppins solo por fidelidad literal a la referencia.

## Colors

`primary` (#1B367B) es exactamente el navy del portafolio (`navy.DEFAULT` en su `tailwind.config.ts`) en lugar del `1C3F6C`/`003093` de la referencia original — es la decisión de coherencia más importante del sistema: cuando este proyecto aparezca como card de preview dentro del portafolio, ambos deben leerse como el mismo azul de marca. `surface-ocean` (#ECF5F8) viene directo de la referencia y se usa como superficie alterna fresca (secciones About/Testimonials) evocando agua clara, con `surface-ocean-border` como borde sutil derivado. `accent-warm` reutiliza el trío cream/cream-border/cream-muted que el portafolio ya tiene definido — así el acento cálido para badges de "Ofertas exclusivas" también es compartido entre ambos proyectos, no inventado. Los semánticos (`success`/`warning`/`error`/`info`) están afinados dentro de la misma familia tonal para que nunca se sientan como colores "de sistema" pegados encima de la marca. Todos los pares texto/fondo cumplen AA: `on-surface` sobre `surface-ocean`, `on-primary` blanco sobre `primary`, `on-accent-warm` sobre `accent-warm`.

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
| `success` sobre `surface` | estado positivo | 5.9:1 | AA |
| `warning` sobre `surface` | estado de alerta | 7.3:1 | AAA |
| `error` sobre `surface` | estado de error | 5.7:1 | AA |
| `info` sobre `surface` | estado informativo | 5.4:1 | AA |

Los tres tokens de borde (`border`, `surface-ocean-border`, `accent-warm-border`) se ajustaron específicamente para esta verificación: los valores iniciales que se habían propuesto para dark mode (tomados de la referencia de Claude Design) daban entre 1.6:1 y 1.7:1 — invisibles como límite de componente. Se aclararon hasta cruzar el mínimo de 3:1 sin perder la identidad de marca (siguen siendo tonos derivados de `primary`/`accent-warm`, solo más claros).

**Nota sobre el modo claro:** al hacer esta verificación se detectó que `border` (#E2E5E8 sobre `surface` blanco) y `surface-ocean-border`/`accent-warm-border` en modo claro también caen por debajo de 3:1 (~1.1–1.3:1) — es un problema preexistente, no introducido por el dark mode. No se corrigió en este pase porque cambia la apariencia de algo ya revisado visualmente; queda como pendiente explícito a decidir (ver Do's and Don'ts).

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

## Do's and Don'ts

✓ Usar `primary` (#1B367B) como único azul de marca en todo el sitio — es el punto de anclaje visual con el portafolio.
✓ Reservar `accent-warm` para momentos puntuales de calidez (ofertas, badges), no como color de fondo extendido.
✓ Mantener el radio píldora en todos los CTAs para que la marca se reconozca de un vistazo, incluso en thumbnail.
✓ Dejar que la fotografía real de comida/mariscos sea la protagonista visual; el sistema de color es deliberadamente comedido para no competir con ella.
✓ Cumplir AA en todos los pares texto/fondo, sobre todo con `body-lg` en Poppins Light.

✗ No introducir un segundo azul (p. ej. el `1C3F6C`/`003093` literal de la referencia) — rompe el ancla compartida con el portafolio.
✗ No usar Poppins Light por debajo de 18px para texto de lectura — cae el contraste de trazo y la legibilidad.
✗ No aplanar las sombras a "flat design" total — el sistema depende de la sensación de profundidad tipo agua/vidrio para su carácter.
✗ No mezclar esquinas rectas de golpe en un componente puntual (p. ej. un botón cuadrado) — rompe el lenguaje de forma suave.

**Pendiente conocido:** los tokens de borde en modo claro (`border`, `surface-ocean-border`, `accent-warm-border`) no cumplen el mínimo WCAG de 3:1 para límites de componentes de UI (ver sección Dark Mode). Se decidió no tocarlos en este pase para no alterar una apariencia ya aprobada — requiere una decisión explícita antes de cerrarse.
