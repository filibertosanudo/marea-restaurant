/**
 * scripts/worker.ts needs two things that turn out to conflict once both
 * are true in the same Node process:
 *
 *   1. Every server module in lib/ starts with `import "server-only"`,
 *      which throws unless the "react-server" condition is active — the
 *      same condition Next.js sets for its own server bundle.
 *   2. @react-email/render's Node build calls `require("react-dom/server")`
 *      to render a template — and react-dom's own package.json routes
 *      `./server` to a build that deliberately throws under the
 *      "react-server" condition, to stop a full server renderer from
 *      accidentally reaching a real RSC bundle.
 *
 * Node's `--conditions` flag is process-wide, so satisfying (1) via
 * `--conditions=react-server` breaks (2). This preload script satisfies
 * (1) directly instead, by patching CommonJS's own module loader (what
 * tsx's `require("server-only")` actually goes through here, since this
 * project has no top-level `"type": "module"`) to short-circuit that one
 * specifier — `server-only/empty.js`, the file the "react-server"
 * condition would have pointed at, is itself a zero-byte no-op, so
 * returning `{}` for it is exactly equivalent. Every other specifier,
 * react-dom included, still resolves through Node's normal loader.
 *
 * Registered via `node --require`, see scripts/worker.ts's own npm script.
 */
// Necessarily CommonJS: Node's --require flag only loads CJS, and it has
// to run before the ESM graph (and tsx's own require patching) exists.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};
