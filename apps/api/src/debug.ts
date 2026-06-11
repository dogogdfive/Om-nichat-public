type DebugEntry = {
  at: string;
  context: string;
  message: string;
  stack?: string;
  meta?: Record<string, unknown>;
};

const MAX_ENTRIES = 50;
const recent: DebugEntry[] = [];

function serializeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

export function recordError(
  context: string,
  err: unknown,
  meta?: Record<string, unknown>,
): void {
  const { message, stack } = serializeError(err);
  const entry: DebugEntry = {
    at: new Date().toISOString(),
    context,
    message,
    stack,
    meta,
  };
  recent.unshift(entry);
  if (recent.length > MAX_ENTRIES) recent.length = MAX_ENTRIES;
  console.error(`[debug] ${context}: ${message}`, meta ?? "");
  if (stack && process.env.NODE_ENV !== "production") {
    console.error(stack);
  }
}

export function debugLog(context: string, message: string, meta?: Record<string, unknown>) {
  console.log(`[${context}] ${message}`, meta ?? "");
}

export function getRecentErrors(limit = 20): DebugEntry[] {
  return recent.slice(0, limit);
}

export function installProcessDebugHandlers(): void {
  process.on("uncaughtException", (err) => {
    recordError("uncaughtException", err);
    console.error("[fatal] uncaught exception — API may be unstable:", err.message);
  });
  process.on("unhandledRejection", (reason) => {
    recordError("unhandledRejection", reason);
    console.error("[fatal] unhandled promise rejection:", reason);
  });
}
