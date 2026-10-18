import "server-only";

/**
 * Server-side error reporting. Always logs; also sends the error to Sentry
 * when SENTRY_DSN is set (plain HTTP envelope, no SDK: nothing runs in the
 * browser and the CSP stays unchanged). Never throws.
 */
export async function captureException(
  err: unknown,
  context: { tags?: Record<string, string | number>; extra?: Record<string, unknown> } = {},
): Promise<void> {
  const error = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err));
  console.error(`[${context.tags?.area ?? "error"}]`, error.message, context.extra ?? "");

  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  const eventId = crypto.randomUUID().replaceAll("-", "");
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    environment: process.env.SENTRY_ENVIRONMENT || process.env.CONTEXT || process.env.NODE_ENV,
    release: process.env.COMMIT_REF,
    server_name: "nadi",
    tags: context.tags,
    extra: { ...context.extra, stack: error.stack },
    exception: { values: [{ type: error.name, value: error.message }] },
  };
  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: dsn.raw }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
  try {
    await fetch(dsn.envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=nadi/1.0`,
      },
      body: envelope,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Monitoring must never break the request it reports on.
  }
}

/** https://<key>@<host>/<project> → envelope endpoint. */
export function parseDsn(raw: string | undefined) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const project = u.pathname.split("/").filter(Boolean).pop();
    if (!u.username || !project || u.protocol !== "https:") return null;
    const prefix = u.pathname.slice(0, u.pathname.lastIndexOf(project)).replace(/\/$/, "");
    return { raw, publicKey: u.username, envelopeUrl: `https://${u.host}${prefix}/api/${project}/envelope/` };
  } catch {
    return null;
  }
}
