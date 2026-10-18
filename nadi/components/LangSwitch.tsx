import Link from "next/link";
import { LANG_NAMES, LANGS } from "@/lib/i18n";
import type { Lang } from "@/lib/types";
import styles from "./LangSwitch.module.css";

const SHORT: Record<Lang, string> = { fr: "FR", ar: "ع", en: "EN" };

/**
 * FR · ع · EN switcher. Pass `onChange` from client components, or `href` to
 * render links (server components, e.g. the counter page).
 */
export function LangSwitch({
  value,
  onChange,
  href,
}: {
  value: Lang;
  onChange?: (lang: Lang) => void;
  href?: (lang: Lang) => string;
}) {
  return (
    <div className={styles.switch} role="group" aria-label="Language">
      {LANGS.map((l) =>
        href ? (
          <Link key={l} href={href(l)} className={styles.opt} aria-current={l === value} title={LANG_NAMES[l]} lang={l}>
            {SHORT[l]}
          </Link>
        ) : (
          <button
            key={l}
            type="button"
            className={styles.opt}
            aria-pressed={l === value}
            title={LANG_NAMES[l]}
            lang={l}
            onClick={() => onChange?.(l)}
          >
            {SHORT[l]}
          </button>
        ),
      )}
    </div>
  );
}
