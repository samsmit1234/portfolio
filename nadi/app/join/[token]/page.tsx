import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { dir, isLang, t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { BrandMark } from "@/components/BrandMark";
import { LangSwitch } from "@/components/LangSwitch";
import styles from "../../login/login.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rejoindre l'équipe", robots: { index: false } };

const TOKEN_RE = /^[0-9a-f]{64}$/;

/** Staff invitation link: sign in (or sign up), confirm, join the restaurant. */
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const { lang: l } = await searchParams;
  const lang: Lang = isLang(l) ? l : "fr";
  const d = t(lang);

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join/${token}`)}`);

  const { data } = TOKEN_RE.test(token)
    ? await supabase.rpc("invitation_info", { p_token: token })
    : { data: null };
  const invite = (data as { restaurant_name: string }[] | null)?.[0];

  async function join() {
    "use server";
    const sb = await getServerSupabase();
    const { error } = await sb.rpc("accept_staff_invitation", { p_token: token });
    if (error) redirect(`/join/${token}?lang=${lang}`);
    redirect("/dashboard");
  }

  return (
    <main dir={dir(lang)} lang={lang} className={styles.page}>
      <div className={styles.top}>
        <div className="brand-row">
          <BrandMark size={34} color="var(--brand)" /> Nadi<span className="dot">.</span>
        </div>
        <LangSwitch value={lang} href={(x) => `/join/${token}?lang=${x}`} />
      </div>
      <form action={join} className={`card ${styles.card}`}>
        <h1>{d.joinTitle}</h1>
        {invite ? (
          <>
            <p>{d.joinText.replace("{name}", invite.restaurant_name)}</p>
            <p className="muted">
              {d.joinedAs} <span dir="ltr">{user.email}</span>
            </p>
            <button className="btn btn-primary btn-lg">{d.joinButton}</button>
          </>
        ) : (
          <>
            <p className="error">{d.inviteInvalid}</p>
            <Link href="/dashboard" className="btn btn-lg">
              {d.dashboard}
            </Link>
          </>
        )}
      </form>
    </main>
  );
}
