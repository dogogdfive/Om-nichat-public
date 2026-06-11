import "./load-env.js";

export function readEnv(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v ? v : undefined;
}
