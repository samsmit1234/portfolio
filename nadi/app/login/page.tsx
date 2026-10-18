import type { Metadata } from "next";
import { safeNext } from "@/lib/safeNext";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  // /auth/callback sends people back here with ?e=link when an email link is invalid or expired.
  // next: where to continue after login, e.g. a staff invitation (/join/<token>).
  return <LoginForm linkExpired={e === "link"} next={safeNext(next)} />;
}
