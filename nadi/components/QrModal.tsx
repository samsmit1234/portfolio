"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import styles from "./QrModal.module.css";

export function QrModal({
  url,
  title,
  big,
  subtitle,
  onClose,
  closeLabel,
  printLabel,
  onPrimaryAction,
}: {
  url: string;
  title: string;
  big?: string;
  subtitle?: string;
  onClose: () => void;
  closeLabel: string;
  printLabel: string;
  /** Replaces "Print" (e.g. "Copy link"); the label comes from printLabel. */
  onPrimaryAction?: () => void;
}) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#1d1712", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`${styles.sheet} qr-print`} onClick={(e) => e.stopPropagation()}>
        <p className={styles.title}>{title}</p>
        {big && <p className={styles.big} dir="ltr">{big}</p>}
        <div className={styles.qr} dangerouslySetInnerHTML={{ __html: svg }} />
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <p className={styles.url} dir="ltr">{url}</p>
        <div className={`${styles.actions} no-print`}>
          <button className="btn" onClick={onPrimaryAction ?? (() => window.print())}>{printLabel}</button>
          <button className="btn btn-primary" onClick={onClose} autoFocus>{closeLabel}</button>
        </div>
      </div>
    </div>
  );
}
