# Prompt para Claude Code — Módulo 15: testimonios y landing desde la base

> Pégalo completo en `Desktop/restaurant-page`. Se ejecuta con el skill
> `build-loop-claude-code`. **Para al final de la Fase 1** con el diseño de la
> moderación y del formulario público de reseña.

---

El módulo 14 cerró la fase 5 a medias: inventario y promociones funcionan, pero
**la sección de ofertas del landing sigue leyendo un archivo TypeScript.** Este
módulo cierra la otra mitad y con ella la última mentira del sistema.

Porque eso es lo que es. El panel le promete al dueño que edita su sitio, y hoy
edita el menú y nada más. `components/marea-landing/content.ts` —337 líneas—
sigue siendo la fuente de:

- **Las ofertas**, aunque `Promotion` tenga `isFeatured` desde el primer día y el
  módulo 14 acabe de construir el CRUD entero.
- **Los testimonios**, aunque `Testimonial` exista con moderación
  (`ReviewStatus`), destacados, orden, y hasta `orderId` para reseñas verificadas
  que vinieron de un pedido real.
- **El texto de "acerca de"**, aunque `BusinessTranslation` tenga `aboutTitle`,
  `aboutBody`, `tagline` y `shortBlurb` por idioma.
- **La dirección, el teléfono y el horario del pie de página**, aunque `Business`
  tenga `addressLine1`, `addressLine2`, `city`, `phone` y `email`, y el módulo 6
  haya construido la pantalla donde se editan los horarios.

Ese último es el que cuesta dinero de verdad: **un horario desactualizado en el
pie es una llamada perdida cada semana**, y hoy cambiarlo requiere tocar el
código y desplegar.

Y hay un segundo hueco, más silencioso. `app/layout.tsx` declara un `title` y una
`description` fijos para **todo el sitio**. No hay `generateMetadata`, ni
`sitemap.ts`, ni `robots.ts`, ni datos estructurados. Para un negocio local que
vive de que lo encuentren en Google, eso no es un detalle técnico: es no estar.

Lee antes de empezar: `docs/CONVENCIONES.md`, `AGENTS.md`,
`components/marea-landing/content.ts` **entero**, y `docs/PLAN-PRODUCCION.md`
fase 5.3 y 5.4.

---

## Cómo trabajar

Como siempre: **todo en inglés** salvo los documentos de planeación, **un pull
request por fase** con ramas encadenadas, autoría exclusivamente tuya, cero
emojis.

```bash
gh pr list --state open          # vacío antes de empezar el módulo
git switch main && git pull
git switch -c feature/landing-fase-0 main
```

Y antes de abrir el pull request de cada fase:

```bash
git diff --stat main..HEAD       # sólo lo de esta fase
```

**Una restricción de arquitectura que condiciona todo el módulo, léela antes de
diseñar nada.** `MareaLandingPage` es un Client Component: el idioma se cambia
en el cliente con `useState`, sin recargar, y por eso `app/page.tsx` le pasa
`menuByLang` con **los dos idiomas ya resueltos**. Todo lo que este módulo mueva
a la base tiene que seguir ese mismo patrón: se consulta en el servidor, se
resuelve en los dos idiomas, y se pasa como props. Nada de convertir el landing
en Server Component ni de recargar al cambiar de idioma — eso sería un rediseño
de la experiencia, no una migración de datos.

---

## Fase 0 — Pendientes arrastrados

**0.1 — Las dos verificaciones de infraestructura** siguen abiertas: SMTP contra
un proveedor real, e impresión contra una impresora térmica física. Confirma que
el apartado que el módulo 14 añadió al plan sigue ahí y actualízalo si cambió
algo. No las resuelvas tú.

**0.2 — Limpieza de ramas fusionadas.**

---

## Fase 1 — Diseño (para y espera aprobación)

Dos superficies nuevas, y la segunda es la interesante.

**Moderación de testimonios.** Pantalla de administración, `BUSINESS_ADMIN`.
Cola de pendientes, aprobar, rechazar, destacar, ordenar. Es una bandeja de
entrada: enséñame cómo se ve con cero pendientes, que es el estado normal el 95%
del tiempo, y cómo se ve con treinta.

**El formulario público de reseña.** Este es el que importa. Va enlazado desde el
correo `order.delivered` que el módulo 11 ya manda, así que el cliente llega con
el pedido ya identificado por su `publicToken`. Eso significa que **la reseña
nace verificada**: sabes que esa persona comió ahí.

Enséñame:

- Cómo se ve para alguien que abre el enlace en el celular, de pie, dos horas
  después de cenar. Si pide más de treinta segundos, no se llena.
- Qué pasa cuando alguien abre el enlace **dos veces**. Una reseña por pedido.
- Qué ve después de enviarla, sabiendo que **no se publica de inmediato** porque
  pasa por moderación. Decirle "gracias" y que luego no aparezca nada es la forma
  más rápida de que el cliente crea que se perdió.

Y una decisión de producto que quiero ver resuelta en el diseño: **¿se muestra la
calificación en el landing?** `Testimonial.rating` existe. Un promedio de
estrellas es lo que la gente busca, pero también es lo que convierte tu sitio en
una página de reseñas que el dueño no controla. Propón con tu razón.

Propón, enséñame y **para aquí**.

---

## Fase 2 — Testimonios

**(a) `/admin/testimonios`**, con lo de arriba. Enciende `enabled: true` en el
sidebar, que lleva en `false` desde el módulo 1.

**(b) El formulario público**, en una ruta que acepte el `publicToken` del
pedido. Reglas que no son opcionales:

- **Una reseña por pedido.** Restricción en la base, no sólo en la interfaz.
- **Límite de tasa**, con `isScopeRateLimited` y la tabla `RateLimitCounter` del
  módulo 10. Es un formulario público que escribe texto en tu sitio: es
  exactamente lo que un spammer busca.
- **`authorName` se congela** al enviarse, como todo lo demás en este proyecto.
- El texto entra en `TestimonialTranslation` con el `sourceLocale` del idioma en
  que se escribió. **No lo traduzcas automáticamente**: una reseña traducida por
  máquina y firmada por un cliente es poner palabras en boca de alguien.

**(c) Sólo `APPROVED` sale en el landing.** Obvio, pero que esté en la consulta y
en una prueba, no en la cabeza de quien la escribió.

---

## Fase 3 — La landing, cien por ciento desde la base

Sustituir, uno por uno, y **en commits separados** para que cada pieza se pueda
revertir sola:

| Sección del landing | Fuente nueva |
|---|---|
| Ofertas | `Promotion` con `isFeatured`, por `sortOrder`, vigentes hoy |
| Testimonios | `Testimonial` aprobados y destacados |
| "Acerca de", tagline, blurb del pie | `BusinessTranslation` |
| Dirección, teléfono, correo | `Business` |
| Horario del pie | `OpeningHour`, formateado desde los minutos que guarda |

**Lo que se queda en `content.ts`:** las cadenas de interfaz. Etiquetas de
botones, encabezados de sección, textos de los formularios, mensajes de error.
Eso **sí** es contenido de código y no tiene nada que hacer en la base.

Tres cosas que se rompen si no las cuidas:

- **El horario formateado es más difícil de lo que parece.** `OpeningHour` guarda
  minutos desde medianoche y permite dos bloques por día y cierres después de
  medianoche (`closesAt > 1440`). "Martes a domingo, 12pm a 11pm" es una
  compresión de siete filas en una frase: días consecutivos con el mismo horario
  se agrupan, los cerrados se omiten. Hazlo en un **módulo puro y probado**, no
  en el componente.
- **Qué pasa cuando no hay nada.** Un negocio recién sembrado no tiene
  testimonios aprobados ni ofertas vigentes. La sección se oculta entera; no se
  queda un encabezado sobre un hueco. Pruébalo con la base vacía.
- **Las ofertas del landing y el motor de promociones del módulo 14 tienen que
  contar la misma verdad.** Si la vitrina anuncia "20% los viernes" y el motor no
  lo aplica porque la vigencia expiró, el cliente lo descubre en el checkout.
  Reutiliza la misma lógica de vigencia, no una segunda que se le parezca.

---

## Fase 4 — Que Google lo encuentre

Un restaurante local vive de las búsquedas de su zona. Hoy el sitio no le da a
Google nada con lo que trabajar.

- **`generateMetadata`** por página, leyendo `metaTitle` y `metaDescription` de
  `BusinessTranslation`, con el nombre del negocio de respaldo. Fuera el título
  fijo de `app/layout.tsx`.
- **Datos estructurados JSON-LD** de tipo `Restaurant`: nombre, dirección,
  teléfono, horarios, rango de precios, tipo de cocina, y el menú. Google los usa
  para el panel lateral y para los resultados enriquecidos, y sale gratis con
  datos que ya tienes. Ojo: los horarios en JSON-LD van en formato
  `Tu,We,Th 12:00-23:00`, que es **otra** transformación de `OpeningHour`
  distinta de la de la Fase 3. Que las dos salgan del mismo módulo puro.
- **`sitemap.ts`** y **`robots.ts`**, con las rutas públicas reales. Cuidado con
  lo que **no** va: `/o/<publicToken>`, `/r/<código>` y `/t/<qrToken>` son
  tokens de capacidad. Un sitemap que los liste publica los pedidos y las
  reservaciones de tus clientes. Y esas rutas necesitan `noindex`.
- **Open Graph y Twitter Card** con una imagen real. Un enlace compartido en
  WhatsApp sin imagen se ve abandonado, y WhatsApp es donde se comparte un
  restaurante en México.
- **`lang` correcto** en el documento según el idioma elegido. Hoy
  `app/layout.tsx` fija `lang="es"` y el cliente lo corrige después.

---

## Fase 5 — Cierre

1. `graphify` y el generador.
2. Nota de bitácora en `Marea-Bitacora/15-Landing-desde-la-base.md`. En la tabla
   de decisiones: si se muestran o no las calificaciones, y por qué.
3. Marca las casillas en `Grupo-1-Comida-Bebida.md` y actualiza la tabla de
   estado del plan. **Con esta fase el alcance original del Grupo 1 queda
   completo**, salvo el asistente con IA, que sigue fuera a propósito.
4. Verificación de autoría y pull request. **Sin fusionar.**

---

## Reglas técnicas

Las de siempre. Cinco propias del módulo:

- **El landing sigue siendo un Client Component** y el idioma se sigue cambiando
  sin recargar. Todo llega resuelto en los dos idiomas desde el servidor.
- **Todo lo público se cachea**, con `unstable_cache` y etiquetas, invalidado
  desde las acciones del panel. El menú ya lo hace; las ofertas, los testimonios
  y los datos del negocio cambian aún menos.
- **El formateo de horarios vive en un módulo puro**, sin Prisma y sin reloj
  interno, con pruebas de los casos feos: dos bloques, cierre después de
  medianoche, un solo día abierto, todos cerrados.
- **Ninguna reseña se publica sin moderación.** Ni siquiera las verificadas por
  pedido.
- **`content.ts` no vuelve a contener un dato del negocio.** Si al terminar
  queda uno, el módulo no está terminado.

Dependencias nuevas: **ninguna autorizada.**

---

## Definición de terminado

- [ ] `npm run lint`, `npx tsc --noEmit` y `npm test` limpios, con la salida.
- [ ] CI en verde, cobertura dentro de umbral.
- [ ] Cambio la dirección y el teléfono en el panel y el pie del landing cambia.
- [ ] Cambio el horario en `/admin/configuracion` y el pie del landing lo
      refleja, bien redactado.
- [ ] Marco una promoción como destacada y aparece en la sección de ofertas.
- [ ] Una promoción caducada **no** aparece, y lo que anuncia la vitrina es lo
      que el motor del módulo 14 aplica en el checkout.
- [ ] Dejo una reseña desde el enlace del correo, no aparece hasta aprobarla, y
      al aprobarla sale en el landing.
- [ ] Abrir el enlace de reseña dos veces no crea dos reseñas.
- [ ] Con la base recién sembrada y sin testimonios ni ofertas, el landing se ve
      bien y no muestra secciones vacías.
- [ ] `grep -n` sobre `content.ts` no encuentra dirección, teléfono, horario,
      textos de "acerca de", ofertas ni testimonios.
- [ ] El JSON-LD valida en la herramienta de resultados enriquecidos de Google.
      Enséñame la captura.
- [ ] `sitemap.xml` **no** contiene ninguna ruta con token de capacidad, y esas
      rutas llevan `noindex`.
- [ ] Un enlace del sitio pegado en WhatsApp muestra título, descripción e
      imagen.
- [ ] `npx next build` sin advertencias nuevas.
- [ ] Un pull request por fase, todos con la plantilla llena, ninguno fusionado.
- [ ] Todo en inglés salvo los documentos de planeación.
- [ ] El grep de autoría devuelve vacío en todas las ramas.

---

## Lo que NO debes hacer

- **No rediseñes el landing.** Este módulo cambia de dónde salen los datos, no
  cómo se ven. Si una sección necesita ajustes porque el contenido real es más
  largo o más corto que el de ejemplo, arréglalo; pero no es una oportunidad de
  rehacer la página.
- **No conviertas el landing en Server Component.**
- **No traduzcas reseñas automáticamente.**
- **No añadas un tercer idioma.** El esquema lo soporta; el momento no es este.
- **No construyas respuestas del negocio a las reseñas.** Es otra tabla y otro
  flujo de moderación.
- **No toques el SSE ni el polling.** Módulo 16, el siguiente.
- **No metas analítica ni píxeles de seguimiento.** Cambia lo que hay que decir
  en el aviso de privacidad y es una decisión aparte.
- **No retraduzcas** los documentos en español.

---

## Cómo trabajar

Con el skill `build-loop-claude-code`. `/review` al cerrar cada fase.
`/security-review` en la Fase 2 —un formulario público que escribe texto que se
publica en tu sitio— y en la Fase 4, por lo del sitemap y los tokens.

**Una parada:** al final de la Fase 1, con el diseño y con tu respuesta sobre las
calificaciones. En lo demás avanza de corrido, abriendo el pull request de cada
fase antes de empezar la siguiente.
