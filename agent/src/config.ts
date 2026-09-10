export type AgentConfig = {
  serverUrl: string;
  deviceToken: string;
  printerHost: string;
  printerPort: number;
  pollIntervalMs: number;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See .env.example.`);
  }
  return value;
}

export function loadConfig(): AgentConfig {
  return {
    serverUrl: required("SERVER_URL").replace(/\/+$/, ""),
    deviceToken: required("DEVICE_TOKEN"),
    printerHost: required("PRINTER_HOST"),
    printerPort: Number(process.env.PRINTER_PORT ?? 9100),
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 2000),
  };
}
