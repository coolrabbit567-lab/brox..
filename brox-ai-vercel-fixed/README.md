# Brox AI — Vercel-deployable version

A multi-mode AI chat website: Chat, Code, Feels, Image, and Advice Brox, with
tokens, an admin panel, voice input/output, and web search.

This version is wired to a real backend so it works outside Claude.ai:

- `api/chat.js` — a Vercel serverless function that calls the Anthropic API
  using a server-side key. Your key is never sent to the browser.
- `src/storagePolyfill.js` — a localStorage-backed stand-in for the
  `window.storage` API the app was originally built against, so the app code
  didn't need to change. See the limitation note below.

## Deploy steps

1. **Get an Anthropic API key** at [console.anthropic.com](https://console.anthropic.com)
   (Settings → API Keys). This is separate from a claude.ai login.
2. **Push this folder to a GitHub repo** (or drag-and-drop deploy on Vercel).
3. **Import the repo in Vercel** ([vercel.com/new](https://vercel.com/new)).
   Vercel auto-detects Vite; no config changes needed.
4. **Add the environment variable**: in your Vercel project →
   Settings → Environment Variables, add:
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   ```
   Redeploy after adding it (env vars only apply to new deployments).
5. Done — visit your `*.vercel.app` URL.

## Local development

```bash
npm install
npm run dev          # UI only, http://localhost:5173
```

To test the `/api/chat` route locally too, use the Vercel CLI instead:

```bash
npm install -g vercel
cp .env.example .env   # fill in your real key
vercel dev
```

## Token/admin data — important limitation

The original app stored users, token balances, and the abuse log in a
**shared** store (`window.storage(..., true)`), meaning every visitor saw
the same data — a real multi-user admin panel.

Outside Claude.ai there's no such shared store available for free, so this
version polyfills it with **localStorage**, which is per-browser only.
That means:

- Each visitor's tokens/name/admin session live only in their own browser.
- An admin logging in from a different device won't see other people's
  balances — there's no single shared "all users" list across devices.
- Clearing browser data resets everything for that visitor.

This keeps the app fully working and deployable with zero extra setup. If
you want genuinely shared, cross-device data (e.g. a real admin dashboard
that sees every user from anywhere), swap `src/storagePolyfill.js` for a
real database — good low-effort options:

- **Vercel KV** (Upstash Redis, integrates directly in the Vercel dashboard)
- **Supabase** (Postgres + generous free tier)
- **Firebase Realtime Database / Firestore**

You'd reimplement the same four methods (`get`, `set`, `delete`, `list`)
against whichever you pick, called from serverless functions in `api/`
instead of directly from the browser (so users can't edit each other's
token balances by tampering with client-side requests). Happy to help wire
one of these up if you want real shared storage.

## Admin panel

Shield icon on the dashboard. Passcode: `brox-admin`

⚠️ This is a simple client-side gate, not real security — visible in the
bundled JS to anyone who looks. Fine for personal/prototype use.

## Image generation

Image Brox uses the free [Pollinations](https://pollinations.ai) image API
directly from the browser — no key needed, works as-is on Vercel.

## Voice

Mic input and read-aloud use the browser's built-in Web Speech APIs
(best support in Chrome/Edge). No setup needed.
