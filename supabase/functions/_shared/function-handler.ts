import { handleCors } from './cors.ts';
import { errorResponse, HttpError } from './errors.ts';
import { logger } from './logging.ts';
import type { RequestHandler } from './runtime.ts';

export function functionHandler(name: string, handler: RequestHandler): RequestHandler {
  return async (request) => {
    const preflight = handleCors(request);
    if (preflight) return preflight;
    try {
      return await handler(request);
    } catch (error) {
      logger.error('edge_function_failed', {
        code: error instanceof HttpError ? error.code : 'INTERNAL_ERROR',
        functionName: name,
        requestUrl: request.url,
        status: error instanceof HttpError ? error.status : 500,
      });
      return errorResponse(request, error);
    }
  };
}
