"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";
import { previewSound } from "@/lib/sound";
import { friendlyError } from "@/lib/errors";
import type { AlertSound, Lang, Restaurant } from "@/lib/types";
import { BrandMark } from "@/components/BrandMark";
import styles from "../dashboard.module.css";

const SOUNDS: AlertSound[] = ["chime", "beep", "siren"];
// Same list as the "logos" bucket (allowed_mime_types); SVG is refused there.
const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function SettingsForm({ restaurant }: { restaurant: Restaurant }) {
  const router = useRouter();
  const [name, setName] = useState(restaurant.name);
  const [logoUrl, setLogoUrl] = useState(restaurant.logo_url);
  const [sound, setSound] = useState<AlertSound>(restaurant.alert_sound);
  const [language, setLanguage] = useState<Lang>(restaurant.language);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Logo currently saved in the database, and files uploaded since then.
  const savedLogo = useRef(restaurant.logo_url);
  const uploaded = useRef<string[]>([]);
  const d = t(language);

  // Storage path of one of this restaurant's logos, from its public URL.
  const logoPath = (url: string | null) => {
    const marker = "/storage/v1/object/public/logos/";
    const i = url?.indexOf(marker) ?? -1;
    if (!url || i < 0) return null;
    const path = decodeURIComponent(url.slice(i + marker.length));
    return path.startsWith(`${restaurant.id}/`) ? path : null;
  };

  const soundLabel: Record<AlertSound, string> = { chime: d.soundChime, beep: d.soundBeep, siren: d.soundSiren };

  const uploadLogo = async (file: File) => {
    const ext = LOGO_TYPES[file.type];
    if (!ext) return setMsg({ ok: false, text: d.errLogoType });
    if (file.size > MAX_LOGO_BYTES) return setMsg({ ok: false, text: d.errLogoSize });
    setBusy(true);
    setMsg(null);
    const path = `${restaurant.id}/logo-${Date.now()}.${ext}`;
    const supabase = getBrowserSupabase();
    const { error } = await supabase.storage.from("logos").upload(path, file, { contentType: file.type });
    if (error) setMsg({ ok: false, text: friendlyError(error, d) });
    else {
      uploaded.current.push(path);
      setLogoUrl(supabase.storage.from("logos").getPublicUrl(path).data.publicUrl);
    }
    setBusy(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await getBrowserSupabase()
      .from("restaurants")
      .update({ name: name.trim() || restaurant.name, logo_url: logoUrl, alert_sound: sound, language })
      .eq("id", restaurant.id);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: friendlyError(error, d) });

    // Remove logo files no longer used: the replaced one and unsaved uploads.
    const keep = logoPath(logoUrl);
    const stale = [logoPath(savedLogo.current), ...uploaded.current].filter(
      (p): p is string => !!p && p !== keep,
    );
    if (stale.length) await getBrowserSupabase().storage.from("logos").remove([...new Set(stale)]);
    savedLogo.current = logoUrl;
    uploaded.current = [];
    setMsg({ ok: true, text: d.saved });
    router.refresh();
  };

  return (
    <main className={styles.settings}>
      <form onSubmit={save} className={`card ${styles.settingsCard}`}>
        <h1>{d.settings}</h1>

        <label className="field">
          {d.restaurantName}
          <input className="input" value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="field">
          <span>{d.logo}</span>
          <div className={styles.logoRow}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className={styles.logoPreview} />
            ) : (
              <span className={styles.logoPreview}>
                <BrandMark size={36} color="var(--brand)" />
              </span>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            />
            {logoUrl && (
              <button type="button" className="btn btn-ghost" onClick={() => setLogoUrl(null)}>
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="field">
          <span>{d.alertSound}</span>
          <div className={styles.soundRow}>
            {SOUNDS.map((s) => (
              <button
                key={s}
                type="button"
                className={`btn ${styles.choice}`}
                aria-pressed={sound === s}
                onClick={() => {
                  setSound(s);
                  previewSound(s);
                }}
              >
                ▶ {soundLabel[s]}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          {d.language}
          <select className="input" value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
          </select>
        </label>

        <div className={styles.saveRow}>
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {d.save}
          </button>
          {msg && <span className={msg.ok ? "muted" : "error"}>{msg.text}</span>}
        </div>
      </form>
    </main>
  );
}
