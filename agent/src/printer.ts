import { Socket } from "node:net";

/**
 * A TCP socket accepting `write()` only proves the printer's buffer took
 * the bytes — it does not mean paper moved. Plain ESC/POS over raw TCP
 * (no vendor status-query extension) gives no stronger confirmation than
 * this; that's a known, documented limitation, not an oversight — see
 * README.md's own note on it.
 */
export function sendToPrinter(host: string, port: number, data: Buffer, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let settled = false;

    function finish(err?: Error) {
      if (settled) return;
      settled = true;
      if (err) {
        socket.destroy();
        reject(err);
      } else {
        // A graceful end (FIN), not destroy() — some ESC/POS emulators and
        // real printers alike key off the connection closing cleanly to
        // know a ticket is complete.
        socket.end();
        resolve();
      }
    }

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => finish(new Error(`Timed out connecting to printer at ${host}:${port}`)));
    socket.once("error", (err) => finish(err));
    socket.connect(port, host, () => {
      socket.write(data, (err) => finish(err ?? undefined));
    });
  });
}
