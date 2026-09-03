This is Dan Lesko's personal website written in [Next.js 16](https://nextjs.org). The goal of creating this website was to learn the new feature's of Next.js, including but not limited to learning how to use the app router, layouts, and [Auth.js](https://authjs.dev/), previously known as Next Auth.

## Stack

- [Next.js 16](https://nextjs.org) App Router, React 19, TypeScript
- [Tailwind CSS](https://tailwindcss.com/) for styling. There is no component library: the form controls and buttons are plain HTML elements styled by shared class strings in `src/components/ui/`, and the confirmation modal is a native `<dialog>` whose panel, backdrop and open/close transition live in `src/app/globals.css`.
- [Auth.js](https://authjs.dev/) (`next-auth` v5) with GitHub as the only provider
- Postgres via `@vercel/postgres`, hosted on [Neon](https://neon.tech)
- [p5.js](https://p5js.org/) (through `react-p5-wrapper`) for the animation page
- [EmailJS](https://www.emailjs.com/) and [reCAPTCHA](https://developers.google.com/recaptcha) behind the contact form

## Running the page locally

Requires [pnpm](https://pnpm.io). CI builds on Node 22, matching the version pinned on the Vercel project — which is also why `@types/node` tracks 22 rather than the latest, so the types cannot describe APIs the deployed runtime lacks.

Locally, `jsdom` — which one test file uses for DOM-level component coverage — declares `^22.22.2 || ^24.15.0 || >=26.0.0`. Note that is a disjunction rather than a floor: 22.22.2–22.x, 24.15.0–24.x and 26+ qualify; 23.x, 24.0–24.14 and 25.x do not. Node 20 installs but cannot run the full test suite. There is deliberately no `engines` field: the honest range is jsdom's, and declaring it would warn on a Node 24.12 machine that in practice runs every test here green, which is noise rather than information.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

How much you need the environment variables below depends on what you are working on. `/`, `/animation` and `/credits` render with none of them. `/contact` renders with its fields disabled and an explanatory notice, and its mailto link still works. Signing in needs the Auth.js and GitHub values, sending a message needs the reCAPTCHA and EmailJS ones, and `/blog` reads from Postgres — without a database connection it fails rather than rendering empty.

### Scripts

| Script              | What it does                          |
| ------------------- | ------------------------------------- |
| `pnpm dev`          | Development server (Turbopack)        |
| `pnpm build`        | Production build                      |
| `pnpm start`        | Serve a production build              |
| `pnpm lint`         | ESLint, warnings treated as errors    |
| `pnpm typecheck`    | `tsc --noEmit`                        |
| `pnpm test`         | Vitest, once                          |
| `pnpm test:watch`   | Vitest in watch mode                  |
| `pnpm test:e2e`     | Playwright against a production build |
| `pnpm pretty`       | Format everything with Prettier       |
| `pnpm format:check` | Verify formatting without writing     |

CI runs two jobs on every pull request to `main`: lint, format check, typecheck and build in one, and the Playwright suite in another. `pnpm test:e2e` builds and serves the app itself rather than reusing a running server, so it reflects the build rather than the source — rebuild before trusting a result.

The local gate is four commands, not three: `pnpm lint`, `pnpm typecheck`, `pnpm format:check` and `pnpm test`. A clean commit is not a green gate — but not because the hook only runs Prettier, which is what this said until #130. It runs `eslint --fix` too. The gap is narrower and easier to walk into: `eslint --fix` exits 0 on warnings, while `pnpm lint` is `eslint . --max-warnings=0`. So a commit carrying an unused variable passes the hook and fails CI.

## Environment variables

Set these in `.env.local` for local development and in the Vercel project settings for deployed environments. Only the names are documented here.

**Auth.js / GitHub OAuth**

- `AUTH_SECRET`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`

**Database** — read by `@vercel/postgres`; the Neon integration populates this automatically on Vercel.

- `POSTGRES_URL`

**reCAPTCHA**

- `NEXT_PUBLIC_REACT_APP_SITE_KEY_RECAPTCHA` — site key, intentionally public
- `SITE_SECRET_RECAPTCHA` — server-only

**EmailJS**

- `EMAILJS_PRIVATE_KEY` — server-only. This must never be given a `NEXT_PUBLIC_` prefix, which would ship it to the browser.
- `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY`
- `NEXT_PUBLIC_EMAILJS_SERVICE_ID`
- `NEXT_PUBLIC_EMAILJS_TEMPLATE_ID`

The `NEXT_PUBLIC_` prefix on those three is vestigial: the send used to happen in the browser, but it now runs inside a server action, so nothing reads them client-side and their values no longer reach the client bundle.

The code change to drop the prefix has already shipped — `contact-actions.ts` reads `EMAILJS_SERVICE_ID` and falls back to the prefixed name — so the rename no longer needs the Vercel side to go first. Add `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID` and `EMAILJS_PUBLIC_KEY` whenever you like and the app prefers them from the next request; delete the prefixed ones afterwards. [#14](https://github.com/danlesko/landesko-playground/issues/14) closed with this accepted as-is, so it is optional tidying rather than outstanding work. `src/test/server-env-visibility.test.ts` fails if a literal `process.env.NAME` read of any of these appears outside the one file allowed to read them, which is what the prefix removal was for. It is an authoring-time tripwire and a narrow one: it does not see computed access, a value aliased under another name, or a value passed onward to a client component, and the test says so at length.

## Authentication

Sign-in is GitHub OAuth, and the `signIn` callback in `src/auth.ts` allows an explicit list of two email addresses — anyone else is rejected after authenticating. This is a personal site, so signing in only unlocks authoring: creating posts, deleting posts, and reading private ones.

`/blog/create` is additionally protected by `src/middleware.ts`, which redirects unauthenticated requests to the home page.

## Pages

| Route          | Description                                                                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`            | Landing page.                                                                                                                                                                                   |
| `/blog`        | The ten most recent posts. Private posts are hidden unless signed in, which also reveals the create and delete actions.                                                                         |
| `/blog/[id]`   | A single post. Unknown and private-without-a-session ids call `notFound()` and render the root `src/app/not-found.tsx`; a malformed id or a failed query reaches `src/app/blog/[id]/error.tsx`. |
| `/blog/create` | Post authoring form. Signed-in only.                                                                                                                                                            |
| `/animation`   | A p5.js fish tank. Click to blow bubbles; the goldfish follows the cursor and the purple fish avoids it.                                                                                        |
| `/contact`     | Contact form, sent through EmailJS and gated by reCAPTCHA, plus a direct mailto link.                                                                                                           |
| `/credits`     | Attribution for the icons, framework, and libraries used.                                                                                                                                       |

## Deployment

The application is deployed through [Vercel](https://www.vercel.com) on their free tier and uses a Postgres database, hosted in [Neon](https://neon.tech), for storing blog entries. Pull requests get a preview deployment, but GitHub sign-in does not work there, because the OAuth app's callback is registered against the production domain.

## Testing

Unit tests are Vitest, running in Node with no DOM by default. One file,
`src/components/ContactForm.interaction.test.ts`, opts into jsdom with a
`// @vitest-environment jsdom` docblock so it can mount a component and drive a real
submit — that is the only way to cover event-handler wiring here, and it is why the
Node requirement above is jsdom's rather than Next.js's.

Four end-to-end tests are **skipped**, and a skipped test is a declared gap rather
than coverage:

- three blog cases need a live Postgres database to read rows from
- the `/contact` delivery case needs a real reCAPTCHA site key and mail credentials

None of those belong in this repository, so the gap is deliberate. `migrations/` does
hold the schema, so the database half is a connection away rather than unknown.

## Known limitations

**`pnpm audit` is clean**, and this section used to explain at length why it was not.
Both halves of that were resolved by upgrades rather than by a decision to accept
them:

- The `sharp` advisory — four inherited libvips CVEs, patched only outside the range
  `next` then declared — went when Next 16 moved its optional `sharp` dependency from
  `^0.34.3` to `^0.35.4`. It was never overridden; the framework caught up.
- The dev-only advisories in lint and build tooling — ReDoS and DoS entries reaching
  `minimatch`, `brace-expansion`, `ajv`, `flatted`, `picomatch`, `@humanfs/node` and
  `@eslint/plugin-kit` — went with a refresh of those resolutions inside the ranges
  their parents already declared. No `pnpm.overrides` entry was needed for any of
  them, which matters: an override replaces a dependency's declared specification,
  and one of them silently rewired `micromatch`'s `picomatch@^2.3.1` across a major
  to 4.x before being reverted in favour of the plain refresh.

The reachability reasoning that justified accepting the sharp advisory is worth
keeping, because it is the standing answer if another one appears there. It was that
current reachability is low, **not that the CVEs did not matter**: no route in this
app was found that lets a visitor introduce attacker-chosen image bytes for the
optimizer to decode — there is no upload, no image proxy, no response reflection, and
no configured `remotePatterns`, so absolute URLs are rejected. A visitor does still
choose the same-origin path, the width, the quality and the output format.

That reasoning explicitly does **not** cover self-hosted deployments, an exposed
development server, a maliciously contributed asset, or any future route that accepts
image input. If you add one of those, revisit it. Full analysis and its limits are in
[#123](https://github.com/danlesko/landesko-playground/pull/123) — `next.config.ts`
discusses sharp's effect on image size, not this risk.

A clean audit is the point rather than a milestone: it means the next real advisory is
visible instead of buried under known ones.

**Dependency majors are behind deliberately**, each with its own issue recording the
repo-side surface that actually breaks. See the
[open issues](https://github.com/danlesko/landesko-playground/issues) rather than a
list here, which would go stale as they close.
