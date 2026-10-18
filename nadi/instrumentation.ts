import type { Instrumentation } from "next";

// Unhandled errors in server components, route handlers, server actions and
// the proxy are reported the same way as handled ones (see lib/monitoring).
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureException } = await import("./lib/monitoring");
  await captureException(err, {
    tags: { area: "request", route: context.routePath, kind: context.routeType },
    extra: { method: request.method, path: request.path.split("?")[0], digest: (err as { digest?: string }).digest },
  });
};
