import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import styles from "./home.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <div className="brand-row">
        <BrandMark size={40} color="var(--brand)" /> Nadi<span className="dot">.</span>
      </div>
      <h1 className={styles.title}>
        Votre commande
        <br />
        vous appelle.
      </h1>
      <p className={styles.ar} dir="rtl" lang="ar">طلبك يناديك.</p>
      <p className={styles.lead}>
        Remplacez les bipeurs par un QR code. Le client scanne, garde la page ouverte — son téléphone sonne, vibre et
        s&apos;illumine quand c&apos;est prêt. Sans application, sans SMS.
      </p>
      <ol className={styles.steps}>
        <li><b>1</b> Créez le numéro de commande</li>
        <li><b>2</b> Le client scanne le QR</li>
        <li><b>3</b> Touchez « Prête » — son téléphone sonne</li>
      </ol>
      <Link href="/login" className="btn btn-primary btn-lg">Espace restaurant →</Link>
    </main>
  );
}
