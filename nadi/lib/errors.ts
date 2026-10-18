import type { Dict } from "./i18n";

type ErrorLike = { code?: string; message?: string; status?: number; statusCode?: string | number } | null | undefined;

/**
 * Turns Supabase / fetch errors into a translated sentence for staff, instead
 * of raw English messages or "HTTP 401". The raw error goes to the console.
 */
export function friendlyError(err: ErrorLike | number, d: Dict): string {
  if (typeof err === "number") return byStatus(err, d);
  if (err) console.error(err);
  const code = err?.code ?? "";
  const msg = (err?.message ?? "").toLowerCase();
  const status = Number(err?.status ?? err?.statusCode ?? 0);

  if (code === "23505") return d.duplicateNumber;
  if (msg.includes("invalid login credentials")) return d.errLogin;
  if (msg.includes("email not confirmed")) return d.errEmailNotConfirmed;
  if (msg.includes("already registered") || code === "user_already_exists") return d.errUserExists;
  if (msg.includes("password should") || code === "weak_password") return d.errWeakPassword;
  if (msg.includes("rate limit") || status === 429) return d.tooManyTries;
  if (msg.includes("maximum allowed size") || status === 413) return d.errLogoSize;
  if (msg.includes("mime type") || status === 415) return d.errLogoType;
  if (code === "42501" || msg.includes("row-level security") || msg.includes("jwt")) return d.errSession;
  if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network request failed")) {
    return d.errNetwork;
  }
  return status ? byStatus(status, d) : d.errGeneric;
}

function byStatus(status: number, d: Dict): string {
  if (status === 401 || status === 403) return d.errSession;
  if (status === 404) return d.errNotFound;
  if (status === 409) return d.duplicateNumber;
  if (status === 429) return d.tooManyTries;
  return d.errGeneric;
}
