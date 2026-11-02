import { json, isAdmin, readContent } from "../lib/common.mjs";

// GET  /api/leaderboard -> top 5 for each configured board (read from Firebase Firestore)
// POST /api/leaderboard (admin) body = one board's settings -> test result without saving
//
// Collection path examples:
//   lives                          -> all-time
//   challenges/{active}/entries    -> whichever challenge has active: true (newest if several)

const BLOCKED = "Firebase blocked the read. Your security rules need to allow public reads of this collection.";

async function runQuery(base, key, parentPath, structuredQuery) {
  const res = await fetch(`${base}${parentPath}:runQuery${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery }),
  }).catch(() => { throw new Error("Couldn't reach Firebase. Try again in a minute."); });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.[0]?.error?.message || data?.error?.message || `Firebase returned ${res.status}`;
    throw new Error(res.status === 403 ? BLOCKED : res.status === 404 ? "Project not found. Check the project ID." : msg);
  }
  return (data || []).filter((r) => r.document).map((r) => r.document);
}

const val = (f) => f == null ? null
  : f.stringValue ?? (f.integerValue != null ? Number(f.integerValue) : f.doubleValue ?? f.booleanValue ?? f.timestampValue ?? null);
const get = (fields, path) => path.split(".").reduce((o, k) => (o && o[k]) ? (o[k].mapValue ? o[k].mapValue.fields : o[k]) : null, fields);
const num = (v) => typeof v === "number" ? v : (v != null && v !== "" && !isNaN(+v) ? +v : -Infinity);

async function topFive(b) {
  const parts = String(b.collection || "").split("/").map((s) => s.trim()).filter(Boolean);
  if (!b.projectId || !parts.length || parts.length % 2 === 0) throw new Error("Collection path should look like  lives  or  challenges/{active}/entries.");
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(b.projectId)}/databases/(default)/documents`;
  const key = b.apiKey ? `?key=${encodeURIComponent(b.apiKey)}` : "";
  const pathOf = (segs) => segs.length ? "/" + segs.map(encodeURIComponent).join("/") : "";

  // Resolve {active} to the newest document with active: true.
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i].toLowerCase() !== "{active}") continue;
    const docs = await runQuery(base, key, pathOf(parts.slice(0, i - 1)), {
      from: [{ collectionId: parts[i - 1] }],
      where: { fieldFilter: { field: { fieldPath: "active" }, op: "EQUAL", value: { booleanValue: true } } },
      limit: 20,
    });
    if (!docs.length) throw new Error(`No ${parts[i - 1]} document has active: true right now.`);
    const ids = docs.map((d) => d.name.split("/").pop()).sort().reverse();
    parts[i] = ids[0];
  }

  const source = parts.join("/");
  const collectionId = parts.pop();
  const parent = pathOf(parts);

  // Fast path: let Firestore sort. Fallback: read the collection and sort here
  // (covers scores saved as text, or a collection Firestore won't sort).
  let docs = await runQuery(base, key, parent, {
    from: [{ collectionId }],
    orderBy: [{ field: { fieldPath: b.scoreField }, direction: "DESCENDING" }],
    limit: 50,
  }).catch((e) => { if (e.message === BLOCKED) throw e; return []; });
  if (!docs.length) docs = await runQuery(base, key, parent, { from: [{ collectionId }], limit: 1000 });

  const rows = docs.map((d) => {
    const f = d.fields || {};
    return { name: String(val(get(f, b.nameField)) ?? "Unknown").slice(0, 40), score: val(get(f, b.scoreField)) };
  }).sort((x, y) => num(y.score) - num(x.score));

  // One spot per player: keep each name's best score.
  const seen = new Set(), entries = [];
  for (const r of rows) {
    if (seen.has(r.name)) continue;
    seen.add(r.name); entries.push(r);
    if (entries.length === 5) break;
  }
  return { entries, source, scanned: docs.length };
}

export default async (req) => {
  if (req.method === "POST") {
    if (!isAdmin(req)) return json({ error: "Wrong password." }, 401);
    const b = await req.json().catch(() => ({}));
    try { return json(await topFive({ nameField: "name", scoreField: "score", ...b })); }
    catch (e) { return json({ error: e.message }, 400); }
  }
  const { leaderboards } = await readContent();
  const boards = await Promise.all(leaderboards.filter((b) => b.projectId && b.collection).map(async (b) => {
    try { return { label: b.label, entries: (await topFive(b)).entries }; }
    catch { return { label: b.label, entries: [], error: true }; }
  }));
  return json({ boards }, 200, {
    "cache-control": "public, max-age=0, must-revalidate",
    "netlify-cdn-cache-control": "public, durable, s-maxage=60, stale-while-revalidate=600",
  });
};

export const config = { path: "/api/leaderboard" };
