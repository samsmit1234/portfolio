import type { Lang } from "../types";
import { fr } from "./fr";
import { ar } from "./ar";
import { en } from "./en";

export const LANGS: Lang[] = ["fr", "ar", "en"];

/** Each language's name in itself, for language switchers. */
export const LANG_NAMES: Record<Lang, string> = { fr: "Français", ar: "العربية", en: "English" };

export const dir = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");

export type Dict = { [K in keyof typeof fr]: string };

const dicts: Record<Lang, Dict> = { fr, ar, en };

export function t(lang: Lang): Dict {
  return dicts[lang] ?? fr;
}

export function isLang(v: unknown): v is Lang {
  return v === "fr" || v === "ar" || v === "en";
}

/** BCP 47 locale for dates and times. */
export const locale = (lang: Lang) => (lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR");
