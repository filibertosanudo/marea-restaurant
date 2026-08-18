export type Lang = "en" | "es";

export const STR = {
  en: {
    hero: {
      eyebrow: "Boutique Seafood",
      h1Before: "Seafood ",
      h1Highlight: "Delicacies",
      h1After: " That Unveil the Flavor",
      sub: "Dive into freshness — an ocean of flavors awaits at our restaurant.",
      book: "Book a Table",
      promoTitle: "Seafood from the ocean that will become your favorites",
      promoBody:
        "Fresh, delicious, and prepared with attention to detail. Come visit us and see for yourself! Place an order or reserve a table to enjoy the flavors of the sea.",
      viewMenu: "View Full Menu",
      photo: "Fresh seafood · water splash",
    },
    about: {
      eyebrow: "About Us",
      title: "Fresh from local waters, daily.",
      body: "Fresh, delicately prepared seafood sourced daily from local waters.",
    },
    stats: [
      { v: "25+", l: "Years of Experience" },
      { v: "100%", l: "Fresh Ingredients" },
      { v: "10K+", l: "Happy Customers" },
      { v: "50+", l: "Exclusive Recipes" },
    ],
    menu: {
      eyebrow: "Our Menu",
      title: "Signature plates of the season",
      lead: "Browse by course — each dish is built around the day's freshest catch.",
      preorder: "Preorder",
      book: "Book a Table",
    },
    categories: [
      { id: "starters", label: "Starters" },
      { id: "soups", label: "Soups & Salads" },
      { id: "mains", label: "Main Dishes" },
      { id: "sides", label: "Side Dishes" },
      { id: "desserts", label: "Desserts" },
      { id: "beverages", label: "Beverages" },
    ],
    dishes: [
      {
        category: "starters",
        price: "$16",
        img: "Oyster Sampler",
        name: "Oyster Sampler",
        desc: "A chilled selection of six oysters on the half shell with mignonette and fresh lemon.",
      },
      {
        category: "soups",
        price: "$14",
        img: "Lobster Bisque",
        name: "Lobster Bisque",
        desc: "Velvety lobster bisque finished with a touch of cream and cognac.",
      },
      {
        category: "mains",
        price: "$42",
        img: "Lobster Thermidor",
        name: "Lobster Thermidor",
        desc: "Grilled lobster tail with creamy mustard sauce, Parmesan cheese, and garlic butter, served with truffle mashed potatoes.",
      },
      {
        category: "mains",
        price: "$38",
        img: "Seared Chilean Sea Bass",
        name: "Seared Chilean Sea Bass",
        desc: "Tender Chilean sea bass fillet, seared to perfection, with lemon butter sauce, sautéed asparagus, and wild rice.",
      },
      {
        category: "mains",
        price: "$36",
        img: "Seafood Paella Royale",
        name: "Seafood Paella Royale",
        desc: "Saffron-infused Spanish rice with jumbo shrimp, mussels, calamari and chorizo, garnished with fresh herbs.",
      },
      {
        category: "mains",
        price: "$48",
        img: "Garlic Butter Crab Legs",
        name: "Garlic Butter Crab Legs",
        desc: "Juicy Alaskan king crab legs, drenched in garlic butter sauce, served with grilled corn and herb-roasted potatoes.",
      },
      {
        category: "sides",
        price: "$9",
        img: "Garlic Herb Fries",
        name: "Garlic Herb Fries",
        desc: "Crispy fries tossed in garlic butter and fresh herbs.",
      },
      {
        category: "desserts",
        price: "$10",
        img: "Key Lime Tart",
        name: "Key Lime Tart",
        desc: "Tangy key lime custard on a buttery graham crust.",
      },
      {
        category: "beverages",
        price: "$8",
        img: "Citrus Spritz",
        name: "Citrus Spritz",
        desc: "A refreshing non-alcoholic spritz with citrus and mint.",
      },
    ],
    offers: {
      eyebrow: "Exclusive Offers",
      titleBefore: "Exclusive ",
      titleHighlight: "Offers",
      titleAfter: " Just for You!",
      dish: "Signature dish",
      left: [
        {
          title: "Champagne & Oysters Set",
          tag: "$39",
          desc: "6 fresh oysters paired with a glass of premium champagne.",
        },
        {
          title: "Lobster Night",
          tag: "50% OFF",
          desc: "50% off on our signature Lobster Thermidor when you dine in on Thursdays.",
        },
      ],
      right: [
        {
          title: "Seafood Lovers' Platter",
          tag: "$59 (for 2)",
          desc: "An exquisite mix of lobster, prawns, mussels and calamari, served with garlic butter sauce.",
        },
        {
          title: "Sushi & Sashimi Weekend",
          tag: "20% OFF",
          desc: "Enjoy a selection of fresh sushi and sashimi every Friday–Sunday at a special discount.",
        },
      ],
    },
    tmls: {
      eyebrow: "Testimonials",
      title: "What our guests are saying",
      media: "Guests dining",
      items: [
        {
          quote:
            "The freshest seafood I've had — the ambiance matched the flavor perfectly.",
          name: "Elena Petrenko",
        },
        {
          quote: "Every dish tastes like it came straight from the ocean.",
          name: "Andriy Kovalenko",
        },
      ],
    },
    reserve: {
      eyebrow: "Reservation",
      title: "Reserve your table by the water",
      media: "Fresh oysters · splash",
      name: "Name",
      namePh: "Your name",
      contact: "Email or phone number",
      contactPh: "you@example.com",
      guests: "Number of guests",
      guest: "guest",
      guestP: "guests",
      guestPlus: "7+ guests",
      date: "Date",
      time: "Time",
      comments: "Additional comments",
      commentsPh: "Allergies, special occasion, seating preference…",
      submit: "Reservation",
    },
    preorder: {
      name: "Name",
      namePh: "Enter your name",
      phone: "Phone number",
      phonePh: "+1 555 000 0000",
      guests: "Number of guests",
      guestsPh: "e.g. 2",
      date: "Date",
      time: "Time",
      comments: "Additional comments",
      commentsPh: "Allergies, special occasion, seating preference…",
      submit: "Preorder",
    },
    footer: {
      connect: "Let's connect with us",
      emailPh: "Your email address",
      subscribe: "Subscribe",
      blurb: "Boutique seafood, sourced daily from local waters and served by the sea.",
      visit: "Visit Us",
      address: "142 Harbour Pier Road",
      address2: "Marina District, Portside 90210",
      hours: "Open Tue–Sun · 12pm – 11pm",
      contact: "Contact",
      ourMenu: "Our Menu",
      reservations: "Reservations",
      copyright: "© 2026 Marea. All rights reserved.",
      tagline: "Fresh from the ocean, every day.",
    },
  },
  es: {
    hero: {
      eyebrow: "Mariscos Boutique",
      h1Before: "",
      h1Highlight: "Delicias",
      h1After: " del Mar que Revelan el Sabor",
      sub: "Sumérgete en la frescura — un océano de sabores te espera en nuestro restaurante.",
      book: "Reservar Mesa",
      promoTitle: "Mariscos del océano que se volverán tus favoritos",
      promoBody:
        "Frescos, deliciosos y preparados con atención al detalle. ¡Ven a visitarnos y compruébalo tú mismo! Haz un pedido o reserva una mesa para disfrutar los sabores del mar.",
      viewMenu: "Ver Menú Completo",
      photo: "Mariscos frescos · salpicadura",
    },
    about: {
      eyebrow: "Sobre Nosotros",
      title: "Frescura de aguas locales, cada día.",
      body: "Mariscos frescos y delicadamente preparados, obtenidos a diario de aguas locales.",
    },
    stats: [
      { v: "25+", l: "Años de Experiencia" },
      { v: "100%", l: "Ingredientes Frescos" },
      { v: "10K+", l: "Clientes Felices" },
      { v: "50+", l: "Recetas Exclusivas" },
    ],
    menu: {
      eyebrow: "Nuestro Menú",
      title: "Platillos insignia de la temporada",
      lead: "Explora por tiempo — cada platillo se prepara con la pesca más fresca del día.",
      preorder: "Ordenar",
      book: "Reservar Mesa",
    },
    categories: [
      { id: "starters", label: "Entradas" },
      { id: "soups", label: "Sopas y Ensaladas" },
      { id: "mains", label: "Platos Fuertes" },
      { id: "sides", label: "Guarniciones" },
      { id: "desserts", label: "Postres" },
      { id: "beverages", label: "Bebidas" },
    ],
    dishes: [
      {
        category: "starters",
        price: "$16",
        img: "Ostras Surtidas",
        name: "Ostras Surtidas",
        desc: "Una selección fría de seis ostras en su concha con mignonette y limón fresco.",
      },
      {
        category: "soups",
        price: "$14",
        img: "Bisque de Langosta",
        name: "Bisque de Langosta",
        desc: "Bisque de langosta aterciopelada con un toque de crema y coñac.",
      },
      {
        category: "mains",
        price: "$42",
        img: "Langosta Thermidor",
        name: "Langosta Thermidor",
        desc: "Cola de langosta a la parrilla con cremosa salsa de mostaza, queso parmesano y mantequilla de ajo, con puré de papa trufado.",
      },
      {
        category: "mains",
        price: "$38",
        img: "Róbalo Chileno Sellado",
        name: "Róbalo Chileno Sellado",
        desc: "Filete de róbalo chileno sellado a la perfección, con salsa de mantequilla al limón, espárragos salteados y arroz salvaje.",
      },
      {
        category: "mains",
        price: "$36",
        img: "Paella de Mariscos Royale",
        name: "Paella de Mariscos Royale",
        desc: "Arroz español al azafrán con camarón jumbo, mejillones, calamar y chorizo, decorado con hierbas frescas.",
      },
      {
        category: "mains",
        price: "$48",
        img: "Patas de Cangrejo al Ajo",
        name: "Patas de Cangrejo al Ajo",
        desc: "Jugosas patas de cangrejo real de Alaska bañadas en mantequilla de ajo, con elote a la parrilla y papas a las hierbas.",
      },
      {
        category: "sides",
        price: "$9",
        img: "Papas al Ajo y Hierbas",
        name: "Papas al Ajo y Hierbas",
        desc: "Papas crujientes bañadas en mantequilla de ajo y hierbas frescas.",
      },
      {
        category: "desserts",
        price: "$10",
        img: "Tarta de Limón",
        name: "Tarta de Limón",
        desc: "Cremoso de limón agrio sobre una base de galleta amantequillada.",
      },
      {
        category: "beverages",
        price: "$8",
        img: "Spritz Cítrico",
        name: "Spritz Cítrico",
        desc: "Un refrescante spritz sin alcohol con cítricos y menta.",
      },
    ],
    offers: {
      eyebrow: "Ofertas Exclusivas",
      titleBefore: "¡",
      titleHighlight: "Ofertas",
      titleAfter: " Exclusivas Solo para Ti!",
      dish: "Platillo insignia",
      left: [
        {
          title: "Set de Champagne y Ostras",
          tag: "$39",
          desc: "6 ostras frescas acompañadas de una copa de champagne premium.",
        },
        {
          title: "Noche de Langosta",
          tag: "50% DESC.",
          desc: "50% de descuento en nuestra Langosta Thermidor al cenar los jueves.",
        },
      ],
      right: [
        {
          title: "Tabla para Amantes del Mar",
          tag: "$59 (para 2)",
          desc: "Una exquisita mezcla de langosta, camarón, mejillones y calamar, con salsa de mantequilla de ajo.",
        },
        {
          title: "Fin de Semana de Sushi",
          tag: "20% DESC.",
          desc: "Disfruta una selección de sushi y sashimi frescos de viernes a domingo a precio especial.",
        },
      ],
    },
    tmls: {
      eyebrow: "Testimonios",
      title: "Lo que dicen nuestros comensales",
      media: "Comensales disfrutando",
      items: [
        {
          quote:
            "El marisco más fresco que he probado — el ambiente igualó al sabor a la perfección.",
          name: "Elena Petrenko",
        },
        {
          quote: "Cada platillo sabe como si viniera directo del océano.",
          name: "Andriy Kovalenko",
        },
      ],
    },
    reserve: {
      eyebrow: "Reservación",
      title: "Reserva tu mesa junto al mar",
      media: "Ostras frescas · salpicadura",
      name: "Nombre",
      namePh: "Tu nombre",
      contact: "Correo o teléfono",
      contactPh: "tucorreo@ejemplo.com",
      guests: "Número de personas",
      guest: "persona",
      guestP: "personas",
      guestPlus: "7+ personas",
      date: "Fecha",
      time: "Hora",
      comments: "Comentarios adicionales",
      commentsPh: "Alergias, ocasión especial, preferencia de mesa…",
      submit: "Reservar",
    },
    preorder: {
      name: "Nombre",
      namePh: "Escribe tu nombre",
      phone: "Teléfono",
      phonePh: "+52 55 0000 0000",
      guests: "Número de personas",
      guestsPh: "ej. 2",
      date: "Fecha",
      time: "Hora",
      comments: "Comentarios adicionales",
      commentsPh: "Alergias, ocasión especial, preferencia de mesa…",
      submit: "Ordenar",
    },
    footer: {
      connect: "Conéctate con nosotros",
      emailPh: "Tu correo electrónico",
      subscribe: "Suscribirse",
      blurb: "Mariscos boutique, obtenidos a diario de aguas locales y servidos junto al mar.",
      visit: "Visítanos",
      address: "142 Harbour Pier Road",
      address2: "Marina District, Portside 90210",
      hours: "Abierto Mar–Dom · 12pm – 11pm",
      contact: "Contacto",
      ourMenu: "Nuestro Menú",
      reservations: "Reservaciones",
      copyright: "© 2026 Marea. Todos los derechos reservados.",
      tagline: "Frescura del océano, todos los días.",
    },
  },
} as const;

export type Dish = (typeof STR)["en"]["dishes"][number];

export const TIME_SLOTS = (() => {
  const out: { value: string; label: string }[] = [];
  for (let m = 12 * 60; m <= 22 * 60; m += 30) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const ap = h >= 12 ? "PM" : "AM";
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    out.push({
      value: `${h < 10 ? "0" : ""}${h}:${mm === 0 ? "00" : mm}`,
      label: `${h12}:${mm === 0 ? "00" : mm} ${ap}`,
    });
  }
  return out;
})();
