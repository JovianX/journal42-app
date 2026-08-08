# Journal42 app

Authenticated journaling product UI. Sibling to the marketing site in [JovianX/journal42-landingpage](https://github.com/JovianX/journal42-landingpage).

Deployed to GitHub Pages at **https://app.journal42.cloud**.

## Stack

- React 19 + TypeScript + Vite
- React Router
- Firebase Authentication (Google + email/password)
- Cloud Firestore (per-user nuggets + draft)
- Oxlint

## Scripts

```bash
npm install
npm run dev      # http://localhost:5174
npm run build
npm run lint
```

## Firebase setup

This repo is linked to Firebase project `journal42-cf467`.

### Auth

1. Enable **Google** and **Email/Password** under Authentication → Sign-in method.
2. Under Authentication → Settings → Authorized domains, keep `localhost` and add `app.journal42.cloud`.

### Firestore

Journal entries and the composer draft sync to Cloud Firestore (`(default)` database, `eur3`).

- Data: `users/{uid}` (`draft`, `updatedAt`) and `users/{uid}/nuggets/{id}` (`text`, `createdAt`)
- Rules: [firestore.rules](firestore.rules) (owner-only prototype — review before broadly sharing the app)
- Deploy rules/indexes:

```bash
npx -y firebase-tools@latest deploy --only firestore
```

### Web config

3. Copy `.env.example` to `.env` and fill in the web app config from Project settings → Your apps:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_STORAGE_BUCKET=
```

Restart `npm run dev` after changing env vars.

For GitHub Actions, set the same values as repository secrets (names match the `VITE_*` keys above).

## Deploy

[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) builds on push to `main` and deploys to GitHub Pages.

## AI API

The AI backend lives in the sibling `journal42-api` project and should be deployed separately.

Billing (Lemon Squeezy checkout, portal, webhooks) uses the same API base URL:

| Mode | Default `VITE_AI_API_BASE` |
| --- | --- |
| `npm run dev` | `http://localhost:8787` |
| production build | `https://unexhortative-recitable-edyth.ngrok-free.dev/journal42/api` |

Entitlements live in Firestore at `users/{uid}/billing/current` (Admin SDK writes only). Paid CTAs from the marketing site open ` /login?plan=pattern|forever `, which starts checkout after sign-in.

Leave `VITE_AI_API_BASE` blank to use the mode default, or set it to override.

For local end-to-end reflection:

```bash
# terminal 1 — API
cd ../journal42-api && npm run dev

# terminal 2 — app
npm run dev
```

For GitHub Actions, `VITE_AI_API_BASE` is set to the prod API URL in the deploy workflow.

### One-time GitHub + DNS

1. Repo **Settings → Pages**: Source = GitHub Actions. Custom domain = `app.journal42.cloud` (CNAME file is already in `public/`).
2. DNS: CNAME record `app` → `jovianx.github.io` (or the hostname GitHub shows).
3. Wait for HTTPS / DNS to go green in Pages settings.
4. Add `app.journal42.cloud` to Firebase Auth authorized domains.

## Scope

Journal routes require sign-in. Nuggets still store locally in the browser for now.
