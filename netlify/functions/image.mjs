import { store, json, isAdmin } from "../lib/common.mjs";
import { randomUUID } from "node:crypto";

// POST /api/image        (admin) body = image bytes (JPEG/PNG/WebP, max 4 MB) -> {id}
// GET  /api/image/:id    public
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export default async (req, context) => {
  const s = store();
  if (req.method === "POST") {
    if (!isAdmin(req)) return json({ error: "Wrong password." }, 401);
    const type = (req.headers.get("content-type") || "").split(";")[0];
    if (!TYPES.includes(type)) return json({ error: "Use a JPG, PNG or WebP image." }, 400);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 4 * 1024 * 1024) return json({ error: "Images must be under 4 MB." }, 400);
    const id = randomUUID();
    await s.set(`images/${id}`, buf, { metadata: { type } });
    return json({ id });
  }
  const id = context.params?.id || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const r = await s.getWithMetadata(`images/${id}`, { type: "arrayBuffer" });
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(r.data, {
    headers: {
      "content-type": r.metadata?.type || "image/jpeg",
      "cache-control": "public, max-age=604800, immutable",
      "netlify-cdn-cache-control": "public, durable, s-maxage=31536000, immutable",
    },
  });
};

export const config = { path: ["/api/image", "/api/image/:id"] };
