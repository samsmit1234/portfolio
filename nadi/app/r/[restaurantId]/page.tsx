import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getAnonSupabase, UUID_RE } from "@/lib/public";
import { dir, isLang, t } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import { BrandMark } from "@/components/BrandMark";
import styles from "./counter.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Suivre ma commande", robots: { index: false } };

/** Fixed counter QR: customer types the number printed on their receipt. */
export default async function CounterPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ e?: string; lang?: string }>;
}) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(restaurantId)) notFound();

  const { data } = await getAnonSupabase().rpc("get_public_restaurant", { p_restaurant_id: restaurantId });
  const restaurant = data?.[0] as { id: string; name: string; logo_url: string | null; language: Lang } | undefined;
  if (!restaurant) notFound();

  const lang: Lang = isLang(sp.lang) ? sp.lang : restaurant.language;
  const d = t(lang);
  const other: Lang = lang === "fr" ? "ar" : "fr";

  async function find(formData: FormData) {
    "use server";
    const number = String(formData.get("number") ?? "").trim().slice(0, 12);
    const l = String(formData.get("lang") ?? "fr");
    const { data: id } = await getAnonSupabase().rpc("find_order_by_number", {
      p_restaurant_id: restaurantId,
      p_number: number,
    });
    if (id) redirect(`/o/${id}`);
    redirect(`/r/${restaurantId}?e=1&lang=${l}`);
  }

  return (
    <main dir={dir(lang)} lang={lang} className={styles.page}>
      <header className={styles.header}>
        <div className={styles.restaurant}>
          {restaurant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logo_url} alt="" className={styles.logo} />
          ) : (
            <BrandMark size={34} color="var(--brand)" />
          )}
          <span>{restaurant.name}</span>
        </div>
        <a className="btn btn-ghost" href={`/r/${restaurantId}?lang=${other}`}>
          {other === "ar" ? "العربية" : "Français"}
        </a>
      </header>

      <form action={find} className={`card ${styles.form}`}>
        <input type="hidden" name="lang" value={lang} />
        <label htmlFor="number" className={styles.label}>{d.enterNumber}</label>
        <input
          id="number"
          name="number"
          className={`input ${styles.numberInput}`}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          required
          maxLength={12}
          dir="ltr"
        />
        {sp.e && <p className="error">{d.notFoundNumber}</p>}
        <button className="btn btn-primary btn-xl" type="submit">{d.find}</button>
      </form>
    </main>
  );
}
