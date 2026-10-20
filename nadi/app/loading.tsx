import { BrandMark } from "@/components/BrandMark";

// Painted immediately on app start and slow navigations, before the server answers.
export default function Loading() {
  return (
    <div className="app-loading" aria-busy="true" aria-label="Nadi">
      <BrandMark size={56} color="var(--brand)" />
    </div>
  );
}
