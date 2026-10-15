import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/BrandMark";

const SIZES = new Set([96, 180, 192, 512]);

export async function GET(req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params;
  const size = SIZES.has(Number(raw)) ? Number(raw) : 192;
  const maskable = new URL(req.url).searchParams.has("maskable");
  const pad = maskable ? size * 0.2 : size * 0.12;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e0d0b",
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <BrandMark size={size - pad * 2} color="#f0893d" accent="#0e0d0b" />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
