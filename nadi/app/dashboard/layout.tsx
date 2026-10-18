import Link from "next/link";
import { getStaffContext } from "@/lib/staff";
import { dir, t } from "@/lib/i18n";
import { BrandMark } from "@/components/BrandMark";
import { LogoutButton } from "./LogoutButton";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { restaurant, isOwner } = await getStaffContext();
  const d = t(restaurant.language);
  return (
    <div dir={dir(restaurant.language)} lang={restaurant.language} className={styles.shell}>
      <nav className={`${styles.nav} no-print`}>
        <Link href="/dashboard" className="brand-row" style={{ textDecoration: "none" }}>
          <BrandMark size={30} color="var(--brand)" />
          <span className={styles.navName}>{restaurant.name}</span>
        </Link>
        <div className={styles.navLinks}>
          <Link href="/dashboard" className="btn btn-ghost">{d.dashboard}</Link>
          <Link href="/dashboard/stats" className="btn btn-ghost">{d.stats}</Link>
          {isOwner && <Link href="/dashboard/settings" className="btn btn-ghost">{d.settings}</Link>}
          <LogoutButton label={d.logout} />
        </div>
      </nav>
      {children}
    </div>
  );
}
