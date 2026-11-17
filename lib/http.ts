import { AccessDenied } from "@/lib/access/policy";
import { logEvent } from "@/lib/log";

/** An error that becomes a JSON response with this status. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public body: { error: string; message?: string },
  ) {
    super(body.message ?? body.error);
  }
}

type Handler<C> = (request: Request, ctx: C) => Promise<Response>;

/**
 * Wraps every Mini App API route: turns HttpError into its response, AccessDenied into
 * 403 { error: "forbidden", message } (logged as access.denied), anything else into 500.
 */
export function apiHandler<C>(handler: Handler<C>): Handler<C> {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (err) {
      if (err instanceof HttpError) return Response.json(err.body, { status: err.status });
      if (err instanceof AccessDenied) {
        await logEvent(
          "access.denied",
          { reason: err.message, path: new URL(request.url).pathname, method: request.method },
          err.context,
        );
        return Response.json({ error: "forbidden", message: err.message }, { status: 403 });
      }
      await logEvent("api.error", { path: new URL(request.url).pathname, error: err });
      return Response.json({ error: "internal", message: "Something went wrong." }, { status: 500 });
    }
  };
}
