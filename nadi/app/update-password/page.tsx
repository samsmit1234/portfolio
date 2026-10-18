import type { Metadata } from "next";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata: Metadata = { title: "Nouveau mot de passe", robots: { index: false } };

export default function UpdatePasswordPage() {
  return <UpdatePasswordForm />;
}
