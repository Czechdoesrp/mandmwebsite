import { store, json, isAdmin, readConfig, parseYouTube, deleteUpload } from "../lib/common.mjs";

// GET  /api/config  -> public: what the home page should show
// POST /api/config  -> admin: { check:true } | { source:'default'|'youtube'|'upload', url, uploadId, orientation, title }
export default async (req) => {
  if (req.method === "GET") {
    return json(await readConfig(), 200, {
      "cache-control": "public, max-age=0, must-revalidate",
      "netlify-cdn-cache-control": "public, s-maxage=15, stale-while-revalidate=60",
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isAdmin(req)) return json({ error: "Wrong password." }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (body.check) return json({ ok: true });

  const prev = await readConfig();
  const orientation = body.orientation === "horizontal" ? "horizontal" : "vertical";
  const title = String(body.title || "").slice(0, 120);
  let video;

  if (body.source === "youtube") {
    const yt = parseYouTube(body.url);
    if (!yt) return json({ error: "That doesn't look like a YouTube link. Paste the full link from the Share button." }, 400);
    video = { source: "youtube", youtubeId: yt.id, start: yt.start, orientation: body.orientation ? orientation : (yt.shorts ? "vertical" : "horizontal"), title };
  } else if (body.source === "upload") {
    const meta = await store().get(`videos/${body.uploadId}/meta`, { type: "json" });
    if (!meta || meta.status !== "ready") return json({ error: "That upload isn't finished yet. Try uploading again." }, 400);
    video = { source: "upload", uploadId: body.uploadId, mime: meta.mime, orientation, title };
  } else if (body.source === "default") {
    video = { source: "default", orientation: "vertical", title };
  } else {
    return json({ error: "Pick a video source." }, 400);
  }

  const next = { video, updatedAt: new Date().toISOString() };
  await store().setJSON("config", next);

  // Clean up the previously live upload once something else replaces it.
  if (prev.video?.source === "upload" && prev.video.uploadId !== video.uploadId) {
    await deleteUpload(prev.video.uploadId).catch(() => {});
  }
  return json(next);
};

export const config = { path: "/api/config" };
