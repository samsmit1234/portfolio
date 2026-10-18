import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  // /auth/callback sends people back here with ?e=link when an email link is invalid or expired.
  return <LoginForm linkExpired={e === "link"} />;
}
