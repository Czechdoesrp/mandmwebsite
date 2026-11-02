import { store } from "../lib/common.mjs";

// GET /api/video/:id — serves an uploaded video with byte-range support (needed by iPhone Safari).
// Each response covers at most one stored chunk; browsers ask for the next range automatically.
export default async (req, context) => {
  const id = context.params.id;
  if (!/^[0-9a-f-]{36}$/.test(id || "")) return new Response("Not found", { status: 404 });
  const s = store();
  const meta = await s.get(`videos/${id}/meta`, { type: "json" });
  if (!meta || meta.status !== "ready") return new Response("Not found", { status: 404 });

  const total = meta.size;
  const etag = `"${id}"`;
  const base = {
    "content-type": meta.mime,
    "accept-ranges": "bytes",
    etag,
    "cache-control": "public, max-age=86400",
    "netlify-cdn-cache-control": "public, durable, s-maxage=31536000, immutable",
    "netlify-vary": "header=Range",
  };
  if (req.method === "HEAD") return new Response(null, { status: 200, headers: { ...base, "content-length": String(total) } });

  let start = 0, end = total - 1;
  const range = req.headers.get("range");
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (!m) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
    if (m[1] === "" && m[2] !== "") { start = Math.max(0, total - parseInt(m[2], 10)); }
    else { start = parseInt(m[1] || "0", 10); if (m[2] !== "") end = Math.min(parseInt(m[2], 10), total - 1); }
    if (start >= total || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
  }

  // Find the chunk that holds `start`.
  let offset = 0, idx = 0;
  while (idx < meta.sizes.length && offset + meta.sizes[idx] <= start) { offset += meta.sizes[idx]; idx++; }
  const chunkEnd = offset + meta.sizes[idx] - 1;
  end = Math.min(end, chunkEnd);

  const buf = await s.get(`videos/${id}/chunk-${String(idx).padStart(5, "0")}`, { type: "arrayBuffer" });
  if (!buf) return new Response("Missing data", { status: 500 });
  const body = buf.slice(start - offset, end - offset + 1);

  return new Response(body, {
    status: 206,
    headers: { ...base, "content-length": String(body.byteLength), "content-range": `bytes ${start}-${end}/${total}` },
  });
};

export const config = { path: "/api/video/:id" };
