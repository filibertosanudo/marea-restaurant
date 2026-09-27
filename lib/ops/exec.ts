import { spawn } from "node:child_process";

const STDERR_TAIL = 2_000;

/** Only PATH and what the caller names: nothing else from this process reaches the child. */
function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", ...extra };
  return env as unknown as NodeJS.ProcessEnv;
}

/** Runs a program with no shell: arguments are never parsed, and `env` is all the child sees (plus PATH). */
export function run(command: string, args: string[], env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: childEnv(env) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL)));
    child.on("error", (err) => reject(new Error(`${command}: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

/** `producer | consumer`, both without a shell. Rejects if either fails. */
export function runPiped(
  producer: { command: string; args: string[] },
  consumer: { command: string; args: string[] }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = childEnv();
    const a = spawn(producer.command, producer.args, { env });
    const b = spawn(consumer.command, consumer.args, { env, stdio: ["pipe", "ignore", "pipe"] });
    let failure: Error | undefined;
    let open = 2;
    const stderr = { a: "", b: "" };
    const finish = (who: "a" | "b", name: string) => (code: number | null) => {
      if (code !== 0 && !failure) failure = new Error(`${name} exited with ${code}: ${stderr[who].trim()}`);
      if (--open === 0) {
        if (failure) reject(failure);
        else resolve();
      }
    };
    a.stdout.pipe(b.stdin);
    a.stderr.on("data", (c: Buffer) => (stderr.a = (stderr.a + c.toString()).slice(-STDERR_TAIL)));
    b.stderr.on("data", (c: Buffer) => (stderr.b = (stderr.b + c.toString()).slice(-STDERR_TAIL)));
    a.on("error", (err) => reject(new Error(`${producer.command}: ${err.message}`)));
    b.on("error", (err) => reject(new Error(`${consumer.command}: ${err.message}`)));
    a.on("close", finish("a", producer.command));
    b.on("close", finish("b", consumer.command));
  });
}
