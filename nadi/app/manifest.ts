import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nadi — QR pager",
    short_name: "Nadi",
    description: "Votre commande vous appelle. Bipeur de restaurant par QR code.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0e0d0b",
    theme_color: "#0e0d0b",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
