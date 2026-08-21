# Roadmap

Canonical product roadmap for Journal42 across **app**, **api**, and **website**.
Items are not strict priority unless noted. Surfaces: `[app]` `[api]` `[website]`.

## Now (launch blockers)

- [x] Replace ngrok AI API URL with a stable production host (custom domain + HTTPS) `[api]` `[app]`
- [ ] Add per-user / per-IP rate limits on `/reflect` (beyond provider 429 handling) `[api]`
- [x] Enforce plan entitlements server-side on AI (never UI-only) `[api]`
- [ ] Delete account and all data (Auth user + Firestore journal + billing cleanup) `[app]` `[api]`
- [ ] Point marketing primary CTAs at `https://app.journal42.cloud` signup/login; retire invite-only / waitlist as the main funnel `[website]`
- [ ] Align Privacy + Terms with Firestore, AI vendors, Lemon Squeezy billing, and retention `[website]`
- [ ] Link Privacy & Terms from app login / settings `[app]`
- [ ] Error monitoring on app + API (e.g. Sentry) with alerts on 5xx / webhook failures `[app]` `[api]`
- [ ] Soft-launch e2e: signup → write → reflect → upgrade → paid feature → cancel; then a few real payments `[app]` `[api]` `[website]`

## Next

- [ ] Lock a thought from AI (exclude from reflection / history context; never send to the model) `[app]` `[api]`
- [ ] First-run onboarding (why Journal42, write one thought, try reflection once) `[app]`
- [ ] Memory and recall: search (text first; semantic later) over private history `[app]` `[api]`
- [x] Paid unlimited reflections and chat; free daily limits `[app]` `[api]` `[website]`
- [ ] Product analytics funnel: signup → first nugget → upgrade `[app]` `[website]`
- [ ] Ship or clearly mark as coming: tags, folders, mood, streaks (as marketed) `[app]` `[website]`
- [ ] Finish or remove proofread stub (`SHOW_PROOFREAD`) `[app]`
- [ ] Transactional email where Lemon / Firebase do not cover it (welcome, support) `[api]` `[website]`
- [ ] Export journal data (download before delete or leave) `[app]`

## Later

- [ ] Encrypt journal behind a passcode (client-side; readable only after unlock) `[app]`
- [ ] Dedicated History surface or calendar jump once volume grows `[app]`
- [ ] Apple / GitHub sign-in only if still advertised on marketing `[app]` `[website]`
- [ ] Lightweight admin: plan lookup, refund notes, waitlist CRM `[api]`
- [ ] Native App Store / Play packaging (web-first is fine for v1) `[app]`

## Completed

- [x] Marketing site on `journal42.cloud` (landing, features, pricing, legal, cookies) `[website]`
- [x] Authenticated app on `app.journal42.cloud` (Google + email/password) `[app]`
- [x] Firestore sync for nuggets, drafts, and reflection discussions `[app]`
- [x] Live AI reflection API with Firebase ID token auth `[api]` `[app]`
- [x] Compose + saved-thought reflection threads (reply, history nav, review mode) `[app]`
- [x] Day-grouped thoughts list with quiet older-day shelf `[app]`
- [x] Settings, Lemon Squeezy checkout / portal, Firestore entitlements `[app]` `[api]`
- [x] Password reset flow `[app]` `[api]`
- [x] Pricing CTAs can deep-link into app checkout via `?plan=` `[website]` `[app]`

---

Sibling repos: [journal42-landingpage](https://github.com/JovianX/journal42-landingpage) (marketing), `journal42-api` (AI + billing webhooks).
