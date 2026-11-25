---
name: spotter-analyze
description: Generate or refresh spotter.config.json (the Spotter SDK's map of an app's pages, what each is for, and the actions users can take there) for the current frontend repo. Use when the user asks to set up Spotter, run spotter analyze, map their routes or pages for Spotter, or update spotter.config.json after routes changed. Works with no LLM API key.
---

# Spotter: map this app's pages

`spotter.config.json` lists the app's pages. For each one it holds a plain-language description, whether users would ask to go there, and page actions (things a user can do there, each tied to a control). The Spotter widget matches what users type ("where do I change my plan?") against it.

Split the work like this:

- **The `spotter-sdk analyze` CLI is deterministic.** It parses route definitions and the controls in each page, and does not run the app. Route paths and selectors always come from the CLI.
- **You do the judgment calls** that the CLI would otherwise hand to a small model: check the CLI read the right files, decide which routes are real pages, write descriptions, and pick page actions from the controls the CLI found. You never call an LLM API, so the user needs no API key, and their code stays with the coding agent they already use.

Work from the frontend package root: the directory with the `package.json` that depends on `react-router`, `next` or `vue-router`. In a monorepo, `cd` into that package.

## 1. Find the CLI

Use `npx spotter-sdk` if the project has `spotter-sdk` installed. Otherwise use `npx -y spotter-sdk@latest`. While developing the SDK itself, `node /path/to/spotter-sdk/dist/cli/cli.js` also works. The examples below write `spotter-sdk` for whichever form you use.

## 2. Dry run

```bash
spotter-sdk analyze --json
```

This writes nothing. For each route it prints:

- `path`, `sourceFile` (where the route is defined), and `componentFile` (the page component)
- `files`: the page component plus the local components it imports
- `controls`: buttons, tabs and menu items found in those files, each with a `key`, a `selector` and the `label` a user sees
- `hidden`: set when a rule says the route isn't a page (API, resource and dynamic routes), or the path looks like one (`/paywall`, `/loading`, `*-test`)

## 3. Check the routes against the code

Find where routes are really defined, and don't trust the dry run alone. Search the source, not `node_modules`:

| Router | What to search for |
|---|---|
| React Router (data / declarative) | `createBrowserRouter`, `createHashRouter`, `useRoutes(`, `<Route`, `RouteObject`, `children:` |
| React Router framework mode / Remix | `app/routes.ts`, `@react-router/dev/routes`, `flatRoutes(`, the `app/routes/` folder |
| Vue Router | `createRouter(`, `RouteRecordRaw`, `routes:` |
| Next.js | `app/**/page.*`, `pages/**`, also under `src/` (the CLI reads these from the filesystem) |

Routes often span several files. Look for:

- **Route arrays imported into the main router**, such as `children: adminRoutes` or `...settingsRoutes`. The CLI follows relative imports and `@/` and `~/` aliases on its own. If a dry-run path is missing its prefix, the import probably uses an alias the CLI can't resolve.
- **Nested `<Routes>` rendered by a component.** The parent has `<Route path="dashboard/*" element={<Dashboard />} />`, and `Dashboard.tsx` renders its own `<Routes>`. The CLI follows this when `element={<X />}` names a directly imported component. Otherwise, mount the file by hand (step 4).
- **Feature-folder route files** that nothing imports statically, such as files registered through a plugin system or a `glob` import.

Every page a user can reach should be in the dry run, with its full path.

## 4. Fix gaps with flags, not hand edits

Re-run the dry run with flags until it matches the code:

```bash
spotter-sdk analyze --json \
  --routes src/router.tsx \
  --routes src/features/billing/routes.tsx@/billing \
  --exclude /api
```

- `--routes <file>` reads exactly these files and skips auto-discovery, so **list every route file**, including the main one. Repeat the flag or comma-separate the files.
- `--routes <file>@/prefix` mounts that file's routes under `/prefix`.
- `--exclude <prefix>` drops routes from the config entirely. Prefer hiding (step 6) for pages that exist but aren't destinations; use `--exclude` for whole trees that don't belong, such as `/api`.

Only add a route to `spotter.config.json` by hand when the CLI can't express it, for example routes built at runtime from API data. Tell the user, because hand-added routes are dropped the next time `analyze` runs.

## 5. Write the config

Run the same flags without `--json`, and add `--no-llm`:

```bash
spotter-sdk analyze --no-llm --routes ... --exclude ...
```

This writes `spotter.config.json` with placeholder descriptions, every route's `selectors`, and `"navigable": false` plus a `note` on routes hidden by rule.

## 6. Decide which routes are pages

For each route the CLI did not hide, open its `componentFile` and decide whether a user would ever ask to be taken there. Hide it with `"navigable": false` and a short `note` when it is:

- an interstitial the app redirects to: paywall, upsell wall, loading or splash screen, maintenance page
- an auth callback, logout or impersonation endpoint
- an internal test, debug or demo page
- a route that renders no UI

Also check routes the CLI hid by guessing from the path (their `note` ends with "guessed from the path"). Set `"navigable": true` on any that are real pages.

**If you are unsure, ask the user.** List the doubtful routes with what each renders, and let them choose. They know whether `/upgrade` is a page people visit or a wall the app shows.

## 7. Write titles, descriptions and actions

For each navigable route, read its `files` and write:

- `title`: the page name a user would say, such as "Billing" or "Team members".
- `description`: one sentence about what the user can see or do there, in the words a user would type. Name the key things on the page, such as "Upgrade or downgrade your plan, update the card on file, and download past invoices." Don't describe implementation details, and don't just repeat the path.
- `actions`: up to 6 things a user can do on the page, each tied to one entry in that route's `selectors`:

  ```json
  { "name": "change_plan", "description": "Upgrade or downgrade your plan", "selector": "role=button[name=\"Change plan\"]" }
  ```

  Copy the `selector` exactly from the route's `selectors`. Never write a selector yourself. Skip generic controls (close, cancel, back, open menu) and links to other pages. If an important control has no selector because its text is computed (`t('save')`), tell the user that a `data-testid` or `aria-label` on it would make it reachable.

Edit only `title`, `description`, `navigable`, `note` and `actions`. Leave `path` and `selectors` as the CLI wrote them. Re-runs keep these fields once a route has a real description.

## 8. Make it repeatable

Add the exact command to the user's `package.json` scripts, so a re-run uses the same files and exclusions:

```json
"spotter:analyze": "spotter-sdk analyze --no-llm --routes src/router.tsx --exclude /api"
```

Ask before editing `package.json` if the user hasn't asked you to set things up end to end.

## 9. Report

Tell the user:

- how many pages and actions were written, and from which route files
- which routes you hid and why, and which ones you asked them about
- any routes you mounted or added by hand, and anything you couldn't resolve
- the next step: start their dev server and run `spotter-sdk dev` to try the widget on their app with no code changes (it needs an LLM key at runtime, because it answers questions). Then see the README to add the endpoint and widget for production.
