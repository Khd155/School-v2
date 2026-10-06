import { getLogo, type LogoKind } from "@/lib/server/school";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "ministry" && kind !== "school") return new Response("Not found", { status: 404 });
  const logo = await getLogo(kind as LogoKind);
  if (!logo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.mime,
      // URLs carry a content hash (?v=), so a long cache is safe.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // If an SVG is ever opened directly, nothing in it may run or load.
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
