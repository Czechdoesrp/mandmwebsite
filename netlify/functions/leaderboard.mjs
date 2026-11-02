import { json, isAdmin, readContent } from "../lib/common.mjs";

// GET  /api/leaderboard -> top 5 for each configured board (read from Firebase Firestore)
// POST /api/leaderboard (admin) body = one board's settings -> test result without saving
async function topFive(b) {
  const parts = b.collection.split("/").filter(Boolean);
  if (!b.projectId || !parts.length || parts.length % 2 === 0) throw new Error("Collection path should look like  scores  or  weeks/2026-W45/entries.");
  const collectionId = parts.pop();
  const parent = parts.length ? "/" + parts.map(encodeURIComponent).join("/") : "";
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(b.projectId)}/databases/(default)/documents${parent}:runQuery` +
    (b.apiKey ? `?key=${encodeURIComponent(b.apiKey)}` : "");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId }],
      orderBy: [{ field: { fieldPath: b.scoreField }, direction: "DESCENDING" }],
      limit: 5,
    } }),
  }).catch(() => { throw new Error("Couldn't reach Firebase. Try again in a minute."); });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.[0]?.error?.message || data?.error?.message || `Firebase returned ${res.status}`;
    throw new Error(res.status === 403 ? "Firebase blocked the read. Your security rules need to allow public reads of this collection." : res.status === 404 ? "Project not found. Check the project ID." : msg);
  }
  const val = (f) => f == null ? null : f.stringValue ?? (f.integerValue != null ? Number(f.integerValue) : f.doubleValue ?? f.booleanValue ?? null);
  const get = (fields, path) => path.split(".").reduce((o, k) => (o && o[k]) ? (o[k].mapValue ? o[k].mapValue.fields : o[k]) : null, fields);
  return (data || []).filter((r) => r.document).map((r) => {
    const f = r.document.fields || {};
    return { name: String(val(get(f, b.nameField)) ?? "Unknown").slice(0, 40), score: val(get(f, b.scoreField)) };
  });
}

export default async (req) => {
  if (req.method === "POST") {
    if (!isAdmin(req)) return json({ error: "Wrong password." }, 401);
    const b = await req.json().catch(() => ({}));
    try { return json({ entries: await topFive({ nameField: "name", scoreField: "score", ...b }) }); }
    catch (e) { return json({ error: e.message }, 400); }
  }
  const { leaderboards } = await readContent();
  const boards = await Promise.all(leaderboards.filter((b) => b.projectId && b.collection).map(async (b) => {
    try { return { label: b.label, entries: await topFive(b) }; }
    catch { return { label: b.label, entries: [], error: true }; }
  }));
  return json({ boards }, 200, {
    "cache-control": "public, max-age=0, must-revalidate",
    "netlify-cdn-cache-control": "public, durable, s-maxage=60, stale-while-revalidate=600",
  });
};

export const config = { path: "/api/leaderboard" };
