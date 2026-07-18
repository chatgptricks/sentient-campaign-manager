type LogContext = Record<string, string | number | boolean | null | undefined>;

function sanitize(context: LogContext) {
  const blocked = /token|secret|password|authorization|cookie/i;
  return Object.fromEntries(Object.entries(context).filter(([key]) => !blocked.test(key)));
}

export const logger = {
  info(message: string, context: LogContext = {}) {
    if (import.meta.env.DEV) console.info(message, sanitize(context));
  },
  error(message: string, context: LogContext = {}) {
    console.error(message, sanitize(context));
  },
};
