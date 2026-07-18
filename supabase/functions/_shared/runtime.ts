export type RequestHandler = (request: Request) => Response | Promise<Response>;

type DenoRuntime = {
  serve(handler: RequestHandler): void;
  resolveDns?(hostname: string, recordType: 'A' | 'AAAA'): Promise<string[]>;
};

export function getDenoRuntime(): DenoRuntime | undefined {
  return (globalThis as typeof globalThis & { Deno?: DenoRuntime }).Deno;
}

export function serve(handler: RequestHandler): void {
  getDenoRuntime()?.serve(handler);
}
