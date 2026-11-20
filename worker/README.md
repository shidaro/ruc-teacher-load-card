# API proxy

The frontend is static on GitHub Pages. This Cloudflare Worker forwards only the public schedule API GET endpoints and adds a narrowly scoped CORS response for the configured site origin.

## Local development

Run the Worker with Wrangler from this directory, overriding the production origin for localhost:

```sh
npx wrangler dev --config wrangler.toml --var ALLOWED_ORIGIN:http://localhost:5173
```

Set `VITE_SCHEDULE_API_BASE_URL=http://localhost:8787/api/v1` in the frontend's `.env.local` file, then run Vite.

## Deploy

1. Create/sign in to a Cloudflare account and install Wrangler locally with `npm install --save-dev wrangler`.
2. Set `ALLOWED_ORIGIN` in `wrangler.toml` to the GitHub Pages origin, for example `https://account-name.github.io` (origin only, no repository path). The current value is for account `shidaro`.
3. From `worker/`, run `npx wrangler login` and `npx wrangler deploy --config wrangler.toml`.
4. Set the GitHub Actions repository variable `VITE_SCHEDULE_API_BASE_URL` to `https://ruc-teacher-load-card-api.<workers-subdomain>.workers.dev/api/v1` and rebuild/deploy the Pages site. The repository includes `.github/workflows/pages.yml`, which publishes the site on pushes to `main` and requires this variable to be set.

The Worker intentionally does not accept arbitrary upstream URLs. It only forwards the four known API route shapes. CORS limits browser access to the configured site origin; it is not authentication, since the source data and endpoints are public.

## Response caching

Cloudflare Workers Cache is enabled in `wrangler.toml`. Successful responses are cached at Cloudflare's edge and advertise matching browser cache lifetimes:

- Branch list: 24 hours.
- Employee lists: 6 hours.
- Schedule responses: 5 minutes, since the schedule may change during the day.

Non-success upstream responses are marked `no-store` so temporary API errors are not kept in the browser cache.
