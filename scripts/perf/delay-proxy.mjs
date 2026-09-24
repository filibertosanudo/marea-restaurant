// TCP proxy that delays every chunk by DELAY_MS in each direction, to stand in for a hosted database.
//   node scripts/perf/delay-proxy.mjs <listenPort> <targetPort> <delayMs>
import net from "node:net";
const [listenPort, targetPort, delay] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4])];
net.createServer((client) => {
  const upstream = net.connect(targetPort, "127.0.0.1");
  const pipe = (from, to) => {
    from.on("data", (chunk) => setTimeout(() => to.writable && to.write(chunk), delay));
    from.on("end", () => setTimeout(() => to.end(), delay));
    from.on("error", () => to.destroy());
  };
  pipe(client, upstream);
  pipe(upstream, client);
}).listen(listenPort, "127.0.0.1", () => console.log("proxy up"));
