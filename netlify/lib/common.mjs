import { getStore } from "@netlify/blobs";
import { timingSafeEqual, createHash } from "node:crypto";

export const store = () => getStore({ name: "beyond-the-alibi", consistency: "strong" });

export const env = (k) =>
  (typeof Netlify !== "undefined" && Netlify.env?.get(k)) || process.env[k] || "";

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

// Admin password lives in the ADMIN_PASSWORD environment variable on Netlify.
export function isAdmin(req) {
  const expected = env("ADMIN_PASSWORD");
  const given = req.headers.get("x-admin-password") || "";
  if (!expected || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const DEFAULT_CONFIG = {
  video: { source: "default", orientation: "vertical", title: "" },
  updatedAt: null,
};

export async function readConfig() {
  const cfg = await store().get("config", { type: "json" });
  return cfg || DEFAULT_CONFIG;
}

// Accepts youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/ links, or a bare 11-char id.
export function parseYouTube(input) {
  const s = String(input || "").trim();
  if (/^[\w-]{11}$/.test(s)) return { id: s, shorts: false, start: 0 };
  let u;
  try { u = new URL(s.startsWith("http") ? s : "https://" + s); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id = null, shorts = false;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") id = u.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0])) { id = parts[1]; shorts = parts[0] === "shorts"; }
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  const t = u.searchParams.get("t") || u.searchParams.get("start") || "0";
  const m = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  const start = m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  return { id, shorts, start };
}

export async function deleteUpload(id) {
  if (!id) return;
  const s = store();
  const { blobs } = await s.list({ prefix: `videos/${id}/` });
  await Promise.all(blobs.map((b) => s.delete(b.key)));
}

// ---------- site content (case of the week, events, about, socials, leaderboards) ----------
export const DEFAULT_CONTENT = {
  caseOfWeek: { enabled: false, name: "", location: "", years: "", status: "Unsolved", summary: "", imageId: "", imageUrl: "", threadUrl: "" },
  events: [],
  about: {
    title: "Who we are",
    body: "Beyond the Alibi is a true crime community built around the cases themselves: the investigations, the evidence, and the questions that never got answered. We talk timelines and theories, trade documentary and podcast picks, and dig into how cases got solved, or why they didn't.",
    rules: [
      "Respect the victims and their families. They're people, not plot points.",
      "No glorifying killers. We study cases; we don't make fans.",
      "Theories are welcome. Harassing real people is not.",
      "No graphic crime-scene or autopsy images.",
      "Mark spoilers for new documentaries and podcasts.",
    ],
  },
  socials: { tiktok: "", youtube: "", instagram: "", x: "", twitch: "" },
  leaderboards: [
    { label: "Murder & Motive", projectId: "", collection: "", nameField: "name", scoreField: "score", apiKey: "" },
    { label: "Nice Quiet Neighbor", projectId: "", collection: "", nameField: "name", scoreField: "score", apiKey: "" },
  ],
  updatedAt: null,
};

export async function readContent() {
  const c = (await store().get("content", { type: "json" })) || {};
  const d = DEFAULT_CONTENT;
  return {
    caseOfWeek: { ...d.caseOfWeek, ...(c.caseOfWeek || {}) },
    events: Array.isArray(c.events) ? c.events : [],
    about: { ...d.about, ...(c.about || {}) },
    socials: { ...d.socials, ...(c.socials || {}) },
    leaderboards: d.leaderboards.map((b, i) => ({ ...b, ...((c.leaderboards || [])[i] || {}) })),
    updatedAt: c.updatedAt || null,
  };
}

export const str = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
export const httpUrl = (v) => {
  const s = str(v, 500);
  if (!s) return "";
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; } catch { return ""; }
};
