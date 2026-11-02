import { store, json, isAdmin, deleteUpload } from "../lib/common.mjs";
import { randomUUID } from "node:crypto";

// Videos are sent in small chunks because Netlify Functions cap each request at ~6 MB.
//   POST /api/upload?action=start   body {name,size,mime}       -> {id, chunkSize}
//   POST /api/upload?action=chunk&id=..&index=N   body = bytes
//   POST /api/upload?action=finish&id=..&total=N               -> {ok}
//   POST /api/upload?action=cancel&id=..
const CHUNK = 3 * 1024 * 1024;
const MAX_SIZE = 500 * 1024 * 1024;
const OK_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isAdmin(req)) return json({ error: "Wrong password." }, 401);

  const q = new URL(req.url).searchParams;
  const action = q.get("action");
  const s = store();

  if (action === "start") {
    const { name = "", size = 0, mime = "" } = await req.json().catch(() => ({}));
    if (!OK_TYPES.includes(mime)) return json({ error: "Use an MP4, WebM or MOV video." }, 400);
    if (!size || size > MAX_SIZE) return json({ error: "Videos must be under 500 MB." }, 400);
    const id = randomUUID();
    await s.setJSON(`videos/${id}/meta`, { status: "uploading", name: String(name).slice(0, 200), size, mime, created: Date.now() });
    return json({ id, chunkSize: CHUNK });
  }

  const id = q.get("id") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Bad upload id." }, 400);
  const meta = await s.get(`videos/${id}/meta`, { type: "json" });
  if (!meta) return json({ error: "Upload not found." }, 404);

  if (action === "chunk") {
    const index = parseInt(q.get("index"), 10);
    if (!(index >= 0) || index > Math.ceil(meta.size / CHUNK)) return json({ error: "Bad chunk index." }, 400);
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > CHUNK) return json({ error: "Bad chunk size." }, 400);
    await s.set(`videos/${id}/chunk-${String(index).padStart(5, "0")}`, buf);
    return json({ ok: true });
  }

  if (action === "finish") {
    const total = parseInt(q.get("total"), 10);
    const { blobs } = await s.list({ prefix: `videos/${id}/chunk-` });
    if (blobs.length !== total) return json({ error: `Only ${blobs.length} of ${total} pieces arrived. Try again.` }, 400);
    const sizes = [];
    for (let i = 0; i < total; i++) {
      const b = await s.get(`videos/${id}/chunk-${String(i).padStart(5, "0")}`, { type: "arrayBuffer" });
      if (!b) return json({ error: "A piece of the upload is missing. Try again." }, 400);
      sizes.push(b.byteLength);
    }
    const size = sizes.reduce((a, b) => a + b, 0);
    if (size !== meta.size) return json({ error: "The upload size doesn't match. Try again." }, 400);
    await s.setJSON(`videos/${id}/meta`, { ...meta, status: "ready", sizes, size });
    return json({ ok: true, id });
  }

  if (action === "cancel") {
    await deleteUpload(id);
    return json({ ok: true });
  }

  return json({ error: "Unknown action." }, 400);
};

export const config = { path: "/api/upload" };
