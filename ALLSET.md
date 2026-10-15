# AllSet system

Free preview on `/allset/` → paid site. Code: `.worker/allset.js` (routes, queue consumer, Stripe, admin API),
`.worker/allset-preview.js` (read the client's site, fill our template), `.worker/allset-images.js` (image adapter, off).

## Flow

1. Visitor fills in name, email and current site on `/allset/` and clicks **Activate preview, it's free**.
2. `POST /api/allset/activate` checks the Origin, a honeypot (`website`), optional Turnstile, and rate limits in D1
   (`ALLSET_IP_LIMIT_PER_HOUR` per IP, `ALLSET_DAILY_CAP` in total). It stores the lead as `queued` and sends
   `{ leadId }` to the queue `esbjug-allset-previews`. If the `PREVIEW_QUEUE` binding is missing or the send fails,
   the job goes into the D1 table `jobs` instead. Then it redirects to `/allset/thanks/?id=<id>`.
3. The queue consumer (`queue()` in `.worker/index.js`) fetches the client's page and up to two stylesheets,
   pulls out title, text, images, logo and colours, places the images in our template, stores the HTML in R2
   (`<id>/index.html`) and sets the lead to `preview_ready`. The thanks page polls and shows the link
   `/allset/preview/<id>`. Three tries, then the lead stays `failed` with the error for the admin.
4. The admin page `/allset/admin/` lists leads and creates the full-site Stripe Checkout link (at least $2,500, set
   per lead). It only shows the link; it sends no email.
5. Stripe calls `POST /api/stripe/webhook`; `checkout.session.completed` (paid) marks the lead `preview_paid` (preview
   fee) or `paid` (full site).

Nothing is fetched or generated before the click: previews are only built from the queue consumer or the admin's
"Process fallback jobs" (`POST /api/allset/admin/process-jobs`).

## One-time setup (run in this folder)

```sh
# 1. Database. Copy the database_id it prints into wrangler.jsonc (d1_databases[0].database_id).
npx wrangler d1 create esbjug-allset
npx wrangler d1 migrations apply esbjug-allset --remote

# 2. Queue and bucket.
npx wrangler queues create esbjug-allset-previews
npx wrangler r2 bucket create esbjug-allset-previews

# 3. Secrets (ADMIN_TOKEN already exists for the chat and is reused for /allset/admin/).
npx wrangler secret put STRIPE_SECRET_KEY        # sk_live_... (or sk_test_... first)
npx wrangler secret put STRIPE_WEBHOOK_SECRET    # whsec_... from step 4
npx wrangler secret put TURNSTILE_SECRET         # optional; also set TURNSTILE_SITE_KEY in wrangler.jsonc vars
```

4. Stripe dashboard → Developers → Webhooks → Add endpoint `https://esbjugconsult.com/api/stripe/webhook`, events
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Its signing secret is
   `STRIPE_WEBHOOK_SECRET`.
5. Deploy as usual (`npx wrangler deploy`), after `git pull`.

**Until step 1 and 2 are done, `npx wrangler deploy` fails** (placeholder `database_id`, missing queue and bucket),
and that also blocks deploys of the rest of the site. Either do the setup first or leave these changes out of a deploy.

## Vars (wrangler.jsonc, not secret)

| Var | Default | Meaning |
| --- | --- | --- |
| `PREVIEW_FEE_PRICE_ID` | empty | Stripe Price id (`price_...`) for the preview fee. Empty keeps `/api/allset/checkout/preview` closed (503) and the thanks page shows "Price coming soon". The landing page never shows an amount. |
| `TURNSTILE_SITE_KEY` | empty | When set, the worker adds the Turnstile widget to the form. Pair with the secret `TURNSTILE_SECRET`. |
| `IMAGE_PROVIDER` | empty | Name of an image provider registered in `.worker/allset-images.js`. Empty = never generate images. |
| `ALLSET_IP_LIMIT_PER_HOUR` | 3 | Activations per IP per hour. |
| `ALLSET_DAILY_CAP` | 100 | Activations per day in total. |

## Secrets

`ADMIN_TOKEN` (existing), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `TURNSTILE_SECRET`, and the key for
an image provider if you add one. Stripe keys are only ever read from secrets.

## Image generation

`generateImages(env, { leadId, siteUrl, site, slots })` in `.worker/allset-images.js` is the adapter point. It gets
the template slots the client's own site could not fill (`hero`, `section-N`) and returns `{ slot, url }` or
`{ slot, bytes, contentType }`; bytes are stored in R2 and served from `/allset/preview/<id>/<slot>.<ext>`.
Register a provider there (fetch only, official API) and set `IMAGE_PROVIDER`. Midjourney has no official API:
do not add unofficial Midjourney automation (Discord bots, browser scripting or wrappers).

## Admin

`/allset/admin/` asks for the same `ADMIN_TOKEN` as the chat panel (`/panel/`, same localStorage key) and sends it as
`Authorization: Bearer …` to `/api/allset/admin/*` and `/api/allset/checkout/full`. Stripe Checkout links expire
after 24 hours; press the button again for a fresh one.

## Local test

```sh
npx wrangler d1 migrations apply esbjug-allset --local
npx wrangler dev   # queues, D1 and R2 run locally
```
