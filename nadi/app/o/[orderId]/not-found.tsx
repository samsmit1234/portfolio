import { BrandMark } from "@/components/BrandMark";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div style={{ display: "grid", gap: 16, justifyItems: "center" }}>
        <BrandMark size={56} color="var(--brand)" />
        <p style={{ fontWeight: 700, fontSize: "1.2rem" }}>Commande introuvable ou expirée.</p>
        <p dir="rtl" style={{ fontWeight: 700, fontSize: "1.2rem" }}>الطلب غير موجود أو منتهي الصلاحية.</p>
      </div>
    </main>
  );
}
