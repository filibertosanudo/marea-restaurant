/**
 * A stand-in thermal printer for testing without real hardware, per the
 * module's own suggestion: something that listens on 9100 and dumps what
 * it receives. Decodes just enough ESC/POS to prove the real things this
 * module cares about — accents survive the code page, notes print in
 * reverse video, the cut command fires — without pretending to be a full
 * emulator.
 *
 *   npm run mock-printer
 */
import { createServer } from "node:net";
import iconv from "iconv-lite";

const PORT = Number(process.env.MOCK_PRINTER_PORT ?? 9100);
const CODEPAGE = "cp850";

function describe(buffer: Buffer): string {
  const lines: string[] = [];
  let current = "";
  let reverseOn = false;
  // Tracks whether *any* byte in the current line was written while
  // reverse was on — the GS B 0 that turns it back off arrives before the
  // line-feed that triggers flush(), so flush can't just read the live
  // reverseOn flag at that point.
  let currentLineWasReverse = false;
  let i = 0;

  function flush() {
    if (current.length === 0) return;
    lines.push(currentLineWasReverse ? `[REVERSE] ${current}` : current);
    current = "";
    currentLineWasReverse = false;
  }

  while (i < buffer.length) {
    const byte = buffer[i];

    if (byte === 0x1b) {
      // ESC
      const cmd = buffer[i + 1];
      if (cmd === 0x40) {
        i += 2;
        continue;
      } // init
      if (cmd === 0x74) {
        i += 3;
        continue;
      } // select code page
      if (cmd === 0x45 || cmd === 0x61) {
        i += 3;
        continue;
      } // bold / align
      i += 2;
      continue;
    }

    if (byte === 0x1d) {
      // GS
      const cmd = buffer[i + 1];
      if (cmd === 0x21) {
        i += 3;
        continue;
      } // char size
      if (cmd === 0x42) {
        reverseOn = buffer[i + 2] === 1;
        i += 3;
        continue;
      } // reverse video
      if (cmd === 0x56) {
        flush();
        lines.push("--- PAPER CUT ---");
        i += 3;
        continue;
      }
      i += 2;
      continue;
    }

    if (byte === 0x0a) {
      flush();
      i += 1;
      continue;
    }

    current += iconv.decode(Buffer.from([byte]), CODEPAGE);
    if (reverseOn) currentLineWasReverse = true;
    i += 1;
  }
  flush();
  return lines.join("\n");
}

const server = createServer((socket) => {
  const chunks: Buffer[] = [];
  let handled = false;

  function handle() {
    if (handled) return;
    handled = true;
    const buffer = Buffer.concat(chunks);
    if (buffer.length === 0) return;
    console.log(`\n================ INCOMING TICKET (${new Date().toISOString()}) ================`);
    console.log(describe(buffer));
    console.log(`=================== ${buffer.length} bytes ===================\n`);
  }

  socket.on("data", (chunk) => chunks.push(chunk));
  socket.on("end", handle);
  socket.on("close", handle);
  socket.on("error", (err) => console.error("[mock-printer] socket error:", err.message));
});

server.listen(PORT, () => {
  console.log(`[mock-printer] ESC/POS emulator listening on 0.0.0.0:${PORT}`);
  console.log("[mock-printer] point PRINTER_HOST=localhost PRINTER_PORT=" + PORT + " at it");
});
