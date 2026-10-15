"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { dir, t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { BrandMark } from "@/components/BrandMark";
import styles from "./login.module.css";

export function LoginForm() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("fr");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const d = t(lang);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = getBrowserSupabase();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) setError(error.message);
      else if (data.session) {
        router.replace("/dashboard");
        router.refresh();
        return;
      } else {
        setInfo(d.checkEmail);
        setMode("login");
      }
    }
    setBusy(false);
  };

  return (
    <main dir={dir(lang)} lang={lang} className={styles.page}>
      <div className={styles.top}>
        <div className="brand-row">
          <BrandMark size={34} color="var(--brand)" /> Nadi<span className="dot">.</span>
        </div>
        <button className="btn btn-ghost" onClick={() => setLang(lang === "fr" ? "ar" : "fr")}>
          {lang === "fr" ? "العربية" : "Français"}
        </button>
      </div>
      <form onSubmit={submit} className={`card ${styles.card}`}>
        <h1>{mode === "login" ? d.login : d.signup}</h1>
        <label className="field">
          {d.email}
          <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
        </label>
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
        {error && <p className="error">{error}</p>}
        {info && <p className={styles.info}>{info}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {mode === "login" ? d.login : d.signup}
        </button>
        <p className="muted">
          {mode === "login" ? d.noAccount : d.haveAccount}{" "}
          <button type="button" className={styles.link} onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? d.signup : d.login}
          </button>
        </p>
      </form>
    </main>
  );
}
