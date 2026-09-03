#!/usr/bin/env node
/**
 * graphify-to-obsidian
 * ---------------------------------------------------------------------------
 * Convierte la salida de Graphify (graphify-out/) en un puñado de notas de
 * Obsidian: una por módulo detectado, más un mapa y un índice de archivos.
 *
 * Por qué destilar y no volcar: graph.json son ~800 KB de JSON y 146 archivos.
 * Una nota por archivo llena el vault de ruido que queda obsoleto en cuanto
 * tocas el código, y ninguna IA lee bien un grafo crudo. Lo que sirve como
 * contexto es la forma del sistema — qué módulos hay, qué depende de qué, y
 * cuáles son las funciones que todo el mundo llama.
 *
 * Uso:
 *   node scripts/graphify-to-obsidian.mjs \
 *     --graph graphify-out \
 *     --out "C:/ruta/a/tu/vault/04-Proyectos-Verticales/Marea-Codigo" \
 *     [--dry-run]
 *
 * Es idempotente: reescribe las notas en cada corrida, PERO conserva lo que
 * hayas escrito a mano entre las marcas <!-- notas:inicio --> y
 * <!-- notas:fin -->. Anota con confianza ahí abajo.
 *
 * También borra: al final de la corrida, cualquier nota de módulo o índice
 * que ya exista en OUT_DIR pero que esta corrida no haya vuelto a escribir se
 * elimina (el código se movió, el módulo desapareció). --dry-run enseña qué
 * borraría sin tocar el disco.
 */

import fs from "node:fs";
import path from "node:path";

// --- argumentos -------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const GRAPH_DIR = arg("graph", "graphify-out");
const OUT_DIR = arg("out", path.join(GRAPH_DIR, "obsidian"));
const PROJECT = arg("project", "Marea");
const DRY_RUN = args.includes("--dry-run");

// --- entrada ----------------------------------------------------------------
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const graph = readJson(path.join(GRAPH_DIR, "graph.json"));
let analysis = { gods: [], surprises: [], cohesion: {} };
try {
  analysis = readJson(path.join(GRAPH_DIR, ".graphify_analysis.json"));
} catch {
  console.warn("aviso: no encontré .graphify_analysis.json, sigo sin él");
}

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Nombres legibles por módulo. La clave es la firma de sus dos directorios
 * dominantes, que se mantiene estable mientras el código no se mude de lugar.
 * Si un módulo no aparece aquí, se nombra solo con sus directorios — nunca
 * falla, sólo queda menos bonito. Agrega entradas conforme crezca el proyecto.
 */
const MODULE_NAMES = {
  "lib/cart+components/order": "Carrito y menú público",
  "components/ui+components/admin": "Biblioteca de UI y edición de menú",
  "lib/menu+lib/auth": "Datos del menú y autorización",
  "lib/i18n+app/admin": "Internacionalización y páginas del panel",
  "components/admin+lib/orders": "Tablero de pedidos y tiempo real",
  "components/marea-landing+components/ui": "Landing público",
  "components/admin+lib/auth": "Shell del panel",
  "lib/auth+prisma/seed.ts": "Autenticación y datos semilla",
  "lib/orders+components/order": "Seguimiento del pedido",
  "lib/payments+app/api": "Pagos y webhook de Stripe",
};

const RELATION_ES = {
  calls: "llama a",
  contains: "contiene",
  imports: "importa",
  imports_from: "importa de",
  re_exports: "reexporta",
  extends: "extiende",
  dynamic_import: "importa dinámicamente",
  indirect_call: "llamada indirecta",
  method: "método de",
};

// --- agrupar nodos por comunidad -------------------------------------------
const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
const byCommunity = new Map();
for (const n of graph.nodes) {
  if (!byCommunity.has(n.community)) byCommunity.set(n.community, []);
  byCommunity.get(n.community).push(n);
}

const dirOf = (file) => file.split("/").slice(0, 2).join("/");

function topDirs(nodes, k = 2) {
  const counts = {};
  for (const n of nodes) {
    const d = dirOf(n.source_file);
    counts[d] = (counts[d] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([d]) => d);
}

/**
 * Una comunidad cuenta como "módulo" si tiene al menos dos archivos de código.
 * Lo demás son las comunidades que Graphify arma alrededor de package.json o
 * tsconfig.json: reales, pero no son arquitectura. Van juntas al final.
 */
const modules = [];
const leftovers = [];
for (const [community, nodes] of byCommunity) {
  const files = [...new Set(nodes.map((n) => n.source_file))];
  const codeFiles = files.filter((f) => CODE_EXT.test(f));
  if (codeFiles.length >= 2) modules.push({ community, nodes, files });
  else leftovers.push({ community, nodes, files });
}
modules.sort((a, b) => b.nodes.length - a.nodes.length);

const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

modules.forEach((m, i) => {
  const dirs = topDirs(m.nodes);
  m.dirs = dirs;
  m.name = MODULE_NAMES[dirs.join("+")] ?? dirs.join(" + ");
  m.index = i + 1;
  m.note = `Modulo-${String(m.index).padStart(2, "0")}-${slugify(m.name)}`;
  m.cohesion = analysis.cohesion?.[String(m.community)];
});

const moduleOfNode = new Map();
for (const m of modules) for (const n of m.nodes) moduleOfNode.set(n.id, m);

// --- grado de cada nodo (para "superficie principal") ----------------------
const degree = new Map();
for (const l of graph.links) {
  degree.set(l.source, (degree.get(l.source) || 0) + 1);
  degree.set(l.target, (degree.get(l.target) || 0) + 1);
}

// --- dependencias entre módulos --------------------------------------------
for (const m of modules) {
  m.dependsOn = new Map();
  m.usedBy = new Map();
}
for (const l of graph.links) {
  const from = moduleOfNode.get(l.source);
  const to = moduleOfNode.get(l.target);
  if (!from || !to || from === to) continue;
  from.dependsOn.set(to, (from.dependsOn.get(to) || 0) + 1);
  to.usedBy.set(from, (to.usedBy.get(from) || 0) + 1);
}

// --- conservar las notas escritas a mano ------------------------------------
const NOTES_START = "<!-- notas:inicio -->";
const NOTES_END = "<!-- notas:fin -->";

function preservedNotes(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const prev = fs.readFileSync(filePath, "utf8");
  const a = prev.indexOf(NOTES_START);
  const b = prev.indexOf(NOTES_END);
  if (a === -1 || b === -1 || b < a) return null;
  const inner = prev.slice(a + NOTES_START.length, b).trim();
  return inner || null;
}

function write(name, body) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const filePath = path.join(OUT_DIR, `${name}.md`);
  const kept = preservedNotes(filePath);
  const notes = kept ?? "## Notas\n\n_(Escribe aquí. Esta sección sobrevive a las regeneraciones.)_";
  fs.writeFileSync(filePath, `${body.trimEnd()}\n\n${NOTES_START}\n${notes}\n${NOTES_END}\n`, "utf8");
  return filePath;
}

const commit = (graph.built_at_commit || "").slice(0, 7);
const frontmatter = (extra) =>
  ["---", `proyecto: ${PROJECT}`, ...extra, `commit: ${commit}`, "tags: [marea, codigo, arquitectura, generado]", "---"].join("\n");

const BANNER =
  "> [!info] Nota generada\n" +
  "> La produce `scripts/graphify-to-obsidian.mjs` a partir de Graphify. Todo lo de arriba de **Notas** se sobrescribe en cada corrida; lo que escribas dentro de Notas se conserva. Las notas de módulo que esta corrida no volvió a escribir se borran.";

// --- notas por módulo -------------------------------------------------------
const written = [];
for (const m of modules) {
  const files = m.files.filter((f) => CODE_EXT.test(f)).sort();

  const symbolsByFile = new Map();
  for (const n of m.nodes) {
    if (!symbolsByFile.has(n.source_file)) symbolsByFile.set(n.source_file, []);
    symbolsByFile.get(n.source_file).push(n);
  }

  const surface = m.nodes
    .filter((n) => n._callable)
    .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
    .slice(0, 12);

  const fileLines = files.map((f) => {
    const syms = (symbolsByFile.get(f) || [])
      .filter((n) => n._callable)
      .map((n) => n.label)
      .slice(0, 6);
    return `- \`${f}\`${syms.length ? ` — ${syms.join(", ")}` : ""}`;
  });

  const depLines = [...m.dependsOn.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([mod, count]) => `- [[${mod.note}|${mod.name}]] — ${count} referencia${count === 1 ? "" : "s"}`);

  const useLines = [...m.usedBy.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([mod, count]) => `- [[${mod.note}|${mod.name}]] — ${count} referencia${count === 1 ? "" : "s"}`);

  const cohesionNote =
    m.cohesion === undefined
      ? ""
      : `\n**Cohesión interna:** ${m.cohesion.toFixed(2)} — ${
          m.cohesion < 0.08
            ? "baja; el módulo agrupa cosas que se hablan poco entre sí. Normal en capas transversales (UI, i18n), sospechoso en lógica de negocio."
            : "razonable para un módulo de este tamaño."
        }\n`;

  const body = [
    frontmatter([`tipo: modulo-codigo`, `modulo: "${m.name}"`]),
    `# ${m.name}`,
    "",
    BANNER,
    "",
    `Parte de [[Grupo-1-Comida-Bebida|Marea]] · Mapa: [[00-Mapa-del-Codigo]]`,
    "",
    `**Directorios:** ${m.dirs.map((d) => `\`${d}\``).join(", ")}`,
    `**Archivos:** ${files.length} · **Símbolos:** ${m.nodes.length}`,
    cohesionNote,
    "## Superficie principal",
    "",
    "Los símbolos de este módulo con más conexiones — lo que otros módulos realmente consumen.",
    "",
    "| Símbolo | Archivo | Conexiones |",
    "|---|---|---|",
    ...surface.map((n) => `| \`${n.label}\` | \`${n.source_file}\` ${n.source_location} | ${degree.get(n.id) || 0} |`),
    "",
    "## Archivos",
    "",
    ...fileLines,
    "",
    "## Depende de",
    "",
    ...(depLines.length ? depLines : ["_Nada — este módulo no llama a ningún otro._"]),
    "",
    "## Lo usan",
    "",
    ...(useLines.length ? useLines : ["_Nadie todavía._"]),
  ].join("\n");

  written.push(write(m.note, body));
}

// --- mapa (nota central) ----------------------------------------------------
const totalFiles = new Set(graph.nodes.map((n) => n.source_file).filter((f) => CODE_EXT.test(f))).size;
const relCounts = {};
for (const l of graph.links) relCounts[l.relation] = (relCounts[l.relation] || 0) + 1;

const gods = (analysis.gods || []).slice(0, 10).map((g) => {
  const n = nodesById.get(g.id);
  const mod = moduleOfNode.get(g.id);
  return `| \`${g.label}\` | ${mod ? `[[${mod.note}\\|${mod.name}]]` : "—"} | \`${n?.source_file ?? "?"}\` | ${g.degree} |`;
});

const surprises = (analysis.surprises || []).slice(0, 8).map(
  (s) => `- \`${s.source}\` → \`${s.target}\` (${RELATION_ES[s.relation] ?? s.relation})\n  ${s.source_files?.join(" · ") ?? ""}`
);

const mapBody = [
  frontmatter(["tipo: mapa-codigo"]),
  `# 🗺️ Mapa del código — ${PROJECT}`,
  "",
  BANNER,
  "",
  `Proyecto: [[Grupo-1-Comida-Bebida]] · Índice completo: [[Indice-de-Archivos]]`,
  "",
  `**${totalFiles} archivos de código · ${graph.nodes.length} símbolos · ${graph.links.length} relaciones · commit \`${commit}\`**`,
  "",
  "## Módulos",
  "",
  "| # | Módulo | Archivos | Símbolos | Directorios |",
  "|---|---|---|---|---|",
  ...modules.map(
    (m) =>
      `| ${m.index} | [[${m.note}\\|${m.name}]] | ${m.files.filter((f) => CODE_EXT.test(f)).length} | ${m.nodes.length} | ${m.dirs.map((d) => `\`${d}\``).join(", ")} |`
  ),
  "",
  "## Funciones que todo el mundo llama",
  "",
  "Si cambias la firma de una de estas, el radio de impacto es el número de la derecha.",
  "",
  "| Símbolo | Módulo | Archivo | Conexiones |",
  "|---|---|---|---|",
  ...gods,
  "",
  "## Conexiones que cruzan módulos",
  "",
  "Graphify las marca como inesperadas porque unen comunidades separadas. En una app de Next.js casi todas son lo mismo y es sano: un componente de cliente llamando a su Server Action.",
  "",
  ...surprises,
  "",
  "## Tipos de relación",
  "",
  ...Object.entries(relCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([r, c]) => `- **${RELATION_ES[r] ?? r}** — ${c}`),
  "",
  "## Regenerar",
  "",
  "```bash",
  "# en el repo restaurant-page",
  "graphify            # vuelve a analizar el código",
  `node scripts/graphify-to-obsidian.mjs --out "<ruta-del-vault>/04-Proyectos-Verticales/Marea-Codigo"`,
  "```",
].join("\n");

written.push(write("00-Mapa-del-Codigo", mapBody));

// --- índice de archivos -----------------------------------------------------
const indexBody = [
  frontmatter(["tipo: indice-codigo"]),
  `# Índice de archivos — ${PROJECT}`,
  "",
  BANNER,
  "",
  `Volver al [[00-Mapa-del-Codigo|mapa]].`,
  "",
  ...modules.flatMap((m) => [
    `## [[${m.note}|${m.name}]]`,
    "",
    ...m.files
      .filter((f) => CODE_EXT.test(f))
      .sort()
      .map((f) => `- \`${f}\``),
    "",
  ]),
  ...(() => {
    // Comunidades de un solo archivo: no son un módulo, pero tampoco son todas
    // basura. Se separan en código suelto (páginas hoja, layouts) y config.
    const rest = [...new Set(leftovers.flatMap((l) => l.files))].sort();
    const loose = rest.filter((f) => CODE_EXT.test(f));
    const config = rest.filter((f) => !CODE_EXT.test(f));
    return [
      ...(loose.length
        ? [
            "## Archivos sin módulo propio",
            "",
            "Graphify los deja en su propia comunidad de un solo archivo: layouts, `loading.tsx`, route handlers — hojas del árbol que casi nadie importa.",
            "",
            ...loose.map((f) => `- \`${f}\``),
            "",
          ]
        : []),
      ...(config.length
        ? ["## Configuración y manifiestos", "", ...config.map((f) => `- \`${f}\``)]
        : []),
    ];
  })(),
].join("\n");

written.push(write("Indice-de-Archivos", indexBody));

// --- podar notas huérfanas ---------------------------------------------------
/**
 * Sólo se tocan archivos con nombre reconocible: las notas de módulo y los dos
 * índices que este script genera. Cualquier otra cosa en OUT_DIR —una nota que
 * alguien dejó a mano— no se toca, aunque no esté en `written`.
 */
const isPrunable = (name) =>
  name.endsWith(".md") &&
  (name.startsWith("Modulo-") || name === "00-Mapa-del-Codigo.md" || name === "Indice-de-Archivos.md");

const writtenNames = new Set(written.map((w) => path.basename(w)));
const toPrune = fs.existsSync(OUT_DIR)
  ? fs.readdirSync(OUT_DIR).filter((f) => isPrunable(f) && !writtenNames.has(f))
  : [];

if (toPrune.length) {
  console.log(`${toPrune.length} nota(s) obsoleta(s)${DRY_RUN ? " (--dry-run, no se borran)" : ", borrando"}:`);
  for (const f of toPrune) console.log("  " + f);
  if (!DRY_RUN) for (const f of toPrune) fs.unlinkSync(path.join(OUT_DIR, f));
} else {
  console.log("0 notas obsoletas");
}

console.log(`${written.length} notas escritas en ${OUT_DIR}`);
for (const w of written) console.log("  " + path.basename(w));
