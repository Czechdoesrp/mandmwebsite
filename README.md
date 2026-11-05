# BeyondTheAlibi.com

- `/` home page: video, Discord #updates feed, game links
- `/admin` admin panel: change the home page video (YouTube link, upload, or original trailer)

## Netlify environment variables
Site configuration → Environment variables:

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | the password for /admin |
| `DISCORD_BOT_TOKEN` | your Discord bot's token |
| `DISCORD_CHANNEL_ID` | the ID of the #updates channel |
| `DISCORD_INVITE` | optional, defaults to https://discord.gg/murderandmotive |

Redeploy after changing these (Deploys → Trigger deploy → Deploy site).

## Discord bot
1. discord.com/developers/applications → New Application → Bot → Reset Token → copy it.
2. On the Bot page, turn on **Message Content Intent**.
3. OAuth2 → URL Generator → scope `bot`, permissions **View Channels** + **Read Message History** → open the link and add it to your server.
4. In Discord, User Settings → Advanced → Developer Mode on. Right-click #updates → Copy Channel ID.

Posts show up on the site within about a minute.

## Admin page sections (beyondthealibi.com/admin)
- **Video**: YouTube link, upload, or the original trailer.
- **Case of the Month**: name, stamp, location, years, summary, photo, Discord thread link. Tick "Show on the home page" to publish.
- **On the Docket**: add, edit and delete events. Times are entered in your time zone and shown in each visitor's.
- **Hall of Fame**: connects to each game's Firebase leaderboard (project ID, collection path, name field, score field). Use "Test connection" before saving. Your Firestore rules must allow public reads of that collection.
- **Who we are**: heading, community description and the "Our code" rules (one per line).
- **Social links**: TikTok, YouTube, Instagram, X, Twitch. Blank ones are hidden.

Sections with nothing in them stay hidden on the home page.
