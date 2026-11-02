import { json, env } from "../lib/common.mjs";

// GET /api/discord — latest posts from the Discord updates channel.
// Needs DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID environment variables on Netlify.
// Results are cached at Netlify's edge for 60 seconds so Discord isn't hit on every visit.
const CACHE = {
  "cache-control": "public, max-age=0, must-revalidate",
  "netlify-cdn-cache-control": "public, durable, s-maxage=60, stale-while-revalidate=600",
};

export default async () => {
  const token = env("DISCORD_BOT_TOKEN");
  const channel = env("DISCORD_CHANNEL_ID");
  if (!token || !channel) return json({ configured: false, messages: [] }, 200, CACHE);

  const res = await fetch(`https://discord.com/api/v10/channels/${channel}/messages?limit=15`, {
    headers: { authorization: `Bot ${token}`, "user-agent": "BeyondTheAlibi (https://beyondthealibi.com, 1.0)" },
  });
  if (!res.ok) {
    const hint = res.status === 401 ? "bot token is wrong"
      : res.status === 403 ? "bot can't see that channel (check its View Channel + Read Message History permissions)"
      : res.status === 404 ? "channel ID is wrong" : `Discord returned ${res.status}`;
    return json({ configured: true, error: hint, messages: [] }, 200, { "cache-control": "no-store" });
  }
  const raw = await res.json();

  const messages = raw
    .filter((m) => [0, 19].includes(m.type))
    .map((m) => {
      const names = Object.fromEntries((m.mentions || []).map((u) => [u.id, u.global_name || u.username]));
      const content = (m.content || "")
        .replace(/<@!?(\d+)>/g, (_, id) => "@" + (names[id] || "member"))
        .replace(/<@&\d+>/g, "@role")
        .replace(/<#\d+>/g, "#channel")
        .replace(/<t:(\d+)(?::\w)?>/g, (_, t) => new Date(+t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
      const a = m.author || {};
      const avatar = a.avatar
        ? `https://cdn.discordapp.com/avatars/${a.id}/${a.avatar}.png?size=64`
        : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(a.id || 0) >> 22n) % 6n)}.png`;
      return {
        id: m.id,
        author: { name: a.global_name || a.username || "Unknown", avatar, bot: !!a.bot },
        content,
        timestamp: m.timestamp,
        edited: !!m.edited_timestamp,
        images: (m.attachments || [])
          .filter((x) => (x.content_type || "").startsWith("image/"))
          .map((x) => ({ url: x.proxy_url || x.url, width: x.width, height: x.height })),
        videos: (m.attachments || [])
          .filter((x) => (x.content_type || "").startsWith("video/"))
          .map((x) => ({ url: x.url })),
        embeds: (m.embeds || [])
          .filter((e) => e.title || e.description || e.image || e.thumbnail)
          .map((e) => ({
            title: e.title || "", description: e.description || "", url: e.url || "",
            color: e.color ? "#" + e.color.toString(16).padStart(6, "0") : "",
            image: e.image?.proxy_url || e.image?.url || (e.type === "image" ? e.thumbnail?.proxy_url || e.thumbnail?.url : "") || "",
            provider: e.provider?.name || "",
          })),
      };
    })
    .filter((m) => m.content || m.images.length || m.embeds.length || m.videos.length)
    .slice(0, 10);

  return json({ configured: true, invite: env("DISCORD_INVITE") || "https://discord.gg/murderandmotive", messages }, 200, CACHE);
};

export const config = { path: "/api/discord" };
