# Frontend configuration

All non-secret frontend configuration lives here.

- `app.json` — branding, defaults, React Query timings, language and localStorage keys.
- `api.json` — backend API base URL and endpoint paths.
- `ui.json` — KPI visibility, table sizes, reporting periods/cutoffs, timeline and source labels.
- `map.json` — map bounds, tiles, zoom/cluster settings and result colors.
- `pwa.json` — PWA/service-worker cache and manifest configuration.
- `build.json` — Vite dev proxy and Orval/OpenAPI generation settings.

The frontend build copies this directory to `/config/frontend/` in the built web app. Runtime JSON files are fetched by the browser before React renders.

Do not put secrets here. Everything under `config/frontend/` is delivered to the browser and is public.
