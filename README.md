# Socio

Publish one post to Instagram, Facebook, TikTok, X, LinkedIn and YouTube at once, now or on a schedule.
AI tools such as Claude will be able to draft and schedule posts through an MCP server (milestone 4).

## Status

| Milestone | What | State |
| --- | --- | --- |
| 1 | Sign-in, accounts, composer, history, cron publisher, LinkedIn (profile + company pages), X | Built |
| 2 | Instagram, Facebook Pages | Built |
| 3 | TikTok, YouTube | Built |
| 4 | MCP server for Claude, REST API, API keys | Built |

## How it works

- **Next.js** app (TypeScript) with a **MySQL** database through Drizzle ORM.
- Each platform is one module in `src/platforms/` implementing the same `Platform` interface
  (sign-in, token exchange, refresh, publish, status check).
- `src/lib/posts.ts` holds the publishing logic shared by the web app, cron, and (later) the API and MCP server.
- `GET /api/cron/publish` publishes due posts and checks on uploads still processing. A Hostinger cron job
  calls it every minute.
- Access tokens are encrypted with AES-256-GCM before they're stored. Uploaded media is stored under
  random file names and served at `/media/<name>` so platforms like Instagram can fetch it.

## Deploying on Hostinger (Business web hosting)

1. In hPanel, add the subdomain `socio.chanzotech.com` and create a **Node.js app** for it from this
   GitHub repo. Build command `npm run build`, start command `npm start`, Node 20 or newer.
2. Create a MySQL database and user in hPanel.
3. Set the environment variables listed in `.env.example`. Use `127.0.0.1` as the database host.
   `APP_URL` is `https://socio.chanzotech.com`.
4. Run the migrations and create your login (hPanel terminal or SSH, in the app folder):
   ```
   npm run db:migrate
   npm run create-user -- you@example.com 'a long password'
   ```
5. Add a cron job that runs every minute:
   ```
   curl -s -H "x-cron-secret: YOUR_CRON_SECRET" https://socio.chanzotech.com/api/cron/publish
   ```
6. Fill in each platform's app keys as you finish the setup guides, then connect accounts on the
   Accounts page.

## Connecting Claude and other AI tools

- **Claude:** Settings, Connectors, Add custom connector, URL `https://socio.chanzotech.com/api/mcp`. Claude sends you to Socio to sign in and approve. The connection then shows on Socio's **AI & API** page, where you can revoke it.
- **Other MCP clients:** the same URL with `Authorization: Bearer <API key>`. Create keys on the AI & API page.
- **REST API** (same key): `GET /api/v1/accounts`, `GET|POST /api/v1/posts`, `GET|DELETE /api/v1/posts/{id}`, `POST /api/v1/posts/{id}/publish`, `POST /api/v1/posts/{id}/schedule` with `{"publish_at": "<ISO 8601>"}`. A new post body is `{"caption", "account_ids", "captions_by_account"?, "media_urls"?}`.
- AI tools can only create drafts until you set `AI_CAN_PUBLISH=true` in the environment variables.

## Local development

```
cp .env.example .env   # then fill it in
npm install
npm run db:migrate
npm run create-user -- you@example.com 'a long password'
npm run dev
```

`npm test` runs the unit tests; `npm run typecheck` checks types. After changing `src/db/schema.ts`,
run `npm run db:generate` to create a new migration.
