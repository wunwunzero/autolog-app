# Autolog app shell

Static PWA front-end for [expense-autolog](https://github.com/wunwunzero/expense-autolog)
(private backend on Google Apps Script). Contains **no data and no secrets** — the
backend address is baked in (not secret; auth lives in the key), and the view key is
stored in `localStorage` on the device only. Hosted on GitHub Pages; add to the iPhone
home screen for the full-screen app.

## Tabs

- **Overview** — month-to-date total, budget ring + green/amber/red envelope bars,
  other spending, recent transactions.
- **Add** — log a manual transaction (cash, or anything no automation sees): merchant,
  amount, currency (non-MYR converts via the day's rate), optional category and date.
  Goes through the backend's full webhook pipeline — dedup, rules, alerts, budgets.
- **Review** — tap-categorize Uncategorized/REVIEW rows (chips + "New…"). Rows stay
  out of Actual Budget until categorised, so clearing this queue is the sync gate.
- **Refresh** — refetch; also happens automatically when the app regains focus.

## Connecting

Type the 12-character view key into the Connect box — or paste any connect link
(`…/exec?view=dash&key=…`, the emailed tap-link, even a Gmail-wrapped copy; the parser
peels every layer). The key's scope on the backend is read + `categorize` + `quickadd`
only; rotating it (backend `rotateDashKey`) kills a leaked key instantly.

- `…/autolog-app/?reset=1` — wipes the stored connection (escape hatch).
- `…/autolog-app/?demo=1` — renders sample data with no backend.
- The Connect screen shows the running app version (`APP_VERSION`).

## iOS notes (hard-won)

- Gmail's in-app browser, Safari, and the home-screen app have **separate storage** —
  connect inside the home-screen app itself.
- iOS keeps the viewport shrunk after the keyboard closes until a scroll event; the
  app keeps every page minimally scrollable and self-nudges on tab switch / input
  blur / sheet close so the fixed tab bar never sticks mid-screen.
- Tab icons are inline SVG because iOS renders glyphs like ☑︎ as emoji.

## Developing

Plain HTML/JS, no build. Bump **both** `app.js?v=N` in `index.html` and `APP_VERSION`
in `app.js` on every change — Safari/PWA caches are sticky and the version stamp is
how staleness gets diagnosed. Icons: `node gen-icon.js` (no dependencies).
