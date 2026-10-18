"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { dir, t } from "@/lib/i18n";
import { friendlyError } from "@/lib/errors";
import type { Lang } from "@/lib/types";
import { BrandMark } from "@/components/BrandMark";
import { LangSwitch } from "@/components/LangSwitch";
import styles from "../login/login.module.css";

/** Reached from the reset email (via /auth/callback, which opened a session). */
export function UpdatePasswordForm() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("fr");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = t(lang);

  useEffect(() => {
    getBrowserSupabase()
      .auth.getUser()
      .then(({ data }) => setHasSession(!!data.user));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError(d.passwordsDiffer);
    setBusy(true);
    setError(null);
    const { error } = await getBrowserSupabase().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(friendlyError(error, d));
    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <main dir={dir(lang)} lang={lang} className={styles.page}>
      <div className={styles.top}>
        <div className="brand-row">
          <BrandMark size={34} color="var(--brand)" /> Nadi<span className="dot">.</span>
        </div>
        <LangSwitch value={lang} onChange={setLang} />
      </div>
      <form onSubmit={submit} className={`card ${styles.card}`}>
        <h1>{d.newPasswordTitle}</h1>
        {hasSession === false ? (
          <>
            <p className="error">{d.linkExpired}</p>
            <Link href="/login" className="btn btn-primary btn-lg">
              {d.login}
            </Link>
          </>
        ) : (
          <>
            <label className="field">
              {d.newPassword}
              <input
                className="input"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
              />
            </label>
            <label className="field">
              {d.confirmPassword}
              <input
                className="input"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                dir="ltr"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn btn-primary btn-lg" disabled={busy || hasSession === null}>
              {d.save}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
