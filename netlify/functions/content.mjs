import { store, json, isAdmin, readContent, str, httpUrl } from "../lib/common.mjs";

// GET  /api/content  -> public site content
// POST /api/content  -> admin: { section: 'caseOfWeek'|'events'|'about'|'socials'|'leaderboards', data }
export default async (req) => {
  if (req.method === "GET") {
    const c = await readContent();
    // Never expose leaderboard connection details publicly beyond labels.
    c.leaderboards = c.leaderboards.map((b) => ({ label: b.label, configured: !!(b.projectId && b.collection) }));
    return json(c, 200, {
      "cache-control": "public, max-age=0, must-revalidate",
      "netlify-cdn-cache-control": "public, s-maxage=15, stale-while-revalidate=60",
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!isAdmin(req)) return json({ error: "Wrong password." }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (new URL(req.url).searchParams.get("full") === "1") return json(await readContent());

  const c = await readContent();
  const d = body.data || {};

  switch (body.section) {
    case "caseOfWeek": {
      const status = ["Unsolved", "Solved", "Cold case", "Open", "Wrongful conviction", "Disputed"].includes(d.status) ? d.status : "Unsolved";
      c.caseOfWeek = {
        enabled: !!d.enabled,
        name: str(d.name, 120), location: str(d.location, 120), years: str(d.years, 60), status,
        summary: str(d.summary, 1500),
        imageId: /^[0-9a-f-]{36}$/.test(d.imageId || "") ? d.imageId : "",
        imageUrl: httpUrl(d.imageUrl),
        threadUrl: httpUrl(d.threadUrl),
      };
      if (c.caseOfWeek.enabled && !c.caseOfWeek.name) return json({ error: "Give the case a name before turning it on." }, 400);
      break;
    }
    case "events": {
      if (!Array.isArray(d)) return json({ error: "Bad events list." }, 400);
      c.events = d.slice(0, 30).map((e) => ({
        id: str(e.id, 40) || Math.random().toString(36).slice(2, 10),
        title: str(e.title, 120), when: str(e.when, 40), where: str(e.where, 120),
        details: str(e.details, 400), link: httpUrl(e.link),
      })).filter((e) => e.title && !isNaN(Date.parse(e.when)))
        .sort((a, b) => Date.parse(a.when) - Date.parse(b.when));
      break;
    }
    case "about": {
      c.about = {
        title: str(d.title, 80) || "Who we are",
        body: str(d.body, 1500),
        rules: (Array.isArray(d.rules) ? d.rules : []).map((r) => str(r, 200)).filter(Boolean).slice(0, 10),
      };
      break;
    }
    case "socials": {
      for (const k of Object.keys(c.socials)) c.socials[k] = httpUrl(d[k]);
      break;
    }
    case "leaderboards": {
      if (!Array.isArray(d)) return json({ error: "Bad leaderboard settings." }, 400);
      c.leaderboards = c.leaderboards.map((b, i) => {
        const x = d[i] || {};
        return {
          label: str(x.label, 60) || b.label,
          projectId: str(x.projectId, 80).replace(/[^a-z0-9-]/gi, ""),
          collection: str(x.collection, 200).replace(/^\/+|\/+$/g, ""),
          nameField: str(x.nameField, 80) || "name",
          scoreField: str(x.scoreField, 80) || "score",
          apiKey: str(x.apiKey, 80),
        };
      });
      break;
    }
    default:
      return json({ error: "Unknown section." }, 400);
  }

  c.updatedAt = new Date().toISOString();
  await store().setJSON("content", c);
  return json(c);
};

export const config = { path: "/api/content" };
