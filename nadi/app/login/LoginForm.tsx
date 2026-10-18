"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { dir, t } from "@/lib/i18n";
import { friendlyError } from "@/lib/errors";
import type { Lang } from "@/lib/types";
import { BrandMark } from "@/components/BrandMark";
import { LangSwitch } from "@/components/LangSwitch";
import styles from "./login.module.css";

type Mode = "login" | "signup" | "reset";

/** Where Supabase email links (confirm, reset) land: /auth/callback exchanges the code. */
const callbackUrl = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

export function LoginForm({ linkExpired: linkExpiredAtLoad = false }: { linkExpired?: boolean }) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("fr");
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [linkExpired, setLinkExpired] = useState(linkExpiredAtLoad);
  const d = t(lang);

  const switchMode = (m: Mode) => {
    setMode(m);
    setLinkExpired(false);
    setError(null);
    setInfo(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = getBrowserSupabase();
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return setError(friendlyError(error, d));
        router.replace("/dashboard");
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callbackUrl("/dashboard") },
        });
        if (error) return setError(friendlyError(error, d));
        if (data.session) {
          router.replace("/dashboard");
          router.refresh();
        } else {
          setInfo(d.checkEmail);
          setMode("login");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: callbackUrl("/update-password"),
        });
        // Same answer whether or not the address has an account.
        if (error && !error.message.toLowerCase().includes("not found")) return setError(friendlyError(error, d));
        setInfo(d.resetSent);
      }
    } catch (err) {
      setError(friendlyError(err as Error, d));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "login" ? d.login : mode === "signup" ? d.signup : d.resetTitle;

  return (
    <main dir={dir(lang)} lang={lang} className={styles.page}>
      <div className={styles.top}>
        <div className="brand-row">
          <BrandMark size={34} color="var(--brand)" /> Nadi<span className="dot">.</span>
        </div>
        <LangSwitch value={lang} onChange={setLang} />
      </div>
      <form onSubmit={submit} className={`card ${styles.card}`}>
        <h1>{title}</h1>
        {mode === "reset" && <p className="muted">{d.resetHint}</p>}
        <label className="field">
          {d.email}
          <input
            className="input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
          />
        </label>
        {mode !== "reset" && (
          <label className="field">
            {d.password}
            <input
              className="input"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
            />
          </label>
        )}
        {linkExpired && <p className="error">{d.linkExpired}</p>}
        {error && <p className="error">{error}</p>}
        {info && <p className={styles.info}>{info}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {mode === "reset" ? d.resetSend : title}
        </button>
        {mode === "login" && (
          <button type="button" className={styles.link} onClick={() => switchMode("reset")}>
            {d.forgotPassword}
          </button>
        )}
        <p className="muted">
          {mode === "signup" ? d.haveAccount : d.noAccount}{" "}
          <button type="button" className={styles.link} onClick={() => switchMode(mode === "signup" ? "login" : "signup")}>
            {mode === "signup" ? d.login : d.signup}
          </button>
          {mode === "reset" && (
            <>
              {" · "}
              <button type="button" className={styles.link} onClick={() => switchMode("login")}>
                {d.login}
              </button>
            </>
          )}
        </p>
      </form>
    </main>
  );
}
