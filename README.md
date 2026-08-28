This is Dan Lesko's personal website written in [Next.js 15](https://nextjs.org). The goal of creating this website was to learn the new feature's of Next.js, including but not limited to learning how to use the app router, layouts, and [Auth.js](https://authjs.dev/), previously known as Next Auth.

## Stack

- [Next.js 15](https://nextjs.org) App Router, React 19, TypeScript
- [Tailwind CSS](https://tailwindcss.com/) for styling, with [Rewind UI](https://rewind-ui.dev/) used minimally for form controls
- [Auth.js](https://authjs.dev/) (`next-auth` v5) with GitHub as the only provider
- Postgres via `@vercel/postgres`, hosted on [Neon](https://neon.tech)
- [p5.js](https://p5js.org/) (through `react-p5-wrapper`) for the animation page
- [EmailJS](https://www.emailjs.com/) and [reCAPTCHA](https://developers.google.com/recaptcha) behind the contact form

## Running the page locally

Requires [pnpm](https://pnpm.io). CI builds on Node 22; Node 20 or newer is recommended locally.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Most pages need the environment variables below. The blog reads from Postgres, so without a database connection `/blog` fails rather than rendering empty.

### Scripts

| Script              | What it does                       |
| ------------------- | ---------------------------------- |
| `pnpm dev`          | Development server (Turbopack)     |
| `pnpm build`        | Production build                   |
| `pnpm start`        | Serve a production build           |
| `pnpm lint`         | ESLint, warnings treated as errors |
| `pnpm typecheck`    | `tsc --noEmit`                     |
| `pnpm pretty`       | Format everything with Prettier    |
| `pnpm format:check` | Verify formatting without writing  |

CI runs lint, format check, typecheck, and build on every pull request to `main`.

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

The code change to drop the prefix has already shipped — `contact-actions.ts` reads `EMAILJS_SERVICE_ID` and falls back to the prefixed name — so the rename no longer needs the Vercel side to go first. Add `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID` and `EMAILJS_PUBLIC_KEY` whenever you like and the app prefers them from the next request; delete the prefixed ones afterwards. [#14](https://github.com/danlesko/landesko-playground/issues/14) closed with this accepted as-is, so it is optional tidying rather than outstanding work. `src/test/server-env-visibility.test.ts` fails if any of these names is ever read outside the one file allowed to read them, which is what the prefix removal was for.

## Authentication

Sign-in is GitHub OAuth, and the `signIn` callback in `src/auth.ts` allows an explicit list of two email addresses — anyone else is rejected after authenticating. This is a personal site, so signing in only unlocks authoring: creating posts, deleting posts, and reading private ones.

`/blog/create` is additionally protected by `src/middleware.ts`, which redirects unauthenticated requests to the home page.

## Pages

| Route          | Description                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/`            | Landing page.                                                                                                           |
| `/blog`        | The ten most recent posts. Private posts are hidden unless signed in, which also reveals the create and delete actions. |
| `/blog/[id]`   | A single post. Unknown, malformed, and private-without-a-session ids all render `src/app/blog/[id]/error.tsx`.          |
| `/blog/create` | Post authoring form. Signed-in only.                                                                                    |
| `/animation`   | A p5.js fish tank. Click to blow bubbles; the goldfish follows the cursor and the purple fish avoids it.                |
| `/contact`     | Contact form, sent through EmailJS and gated by reCAPTCHA, plus a direct mailto link.                                   |
| `/credits`     | Attribution for the icons, framework, and libraries used.                                                               |

## Deployment

The application is deployed through [Vercel](https://www.vercel.com) on their free tier and uses a Postgres database, hosted in [Neon](https://neon.tech), for storing blog entries. Pull requests get a preview deployment, but GitHub sign-in does not work there, because the OAuth app's callback is registered against the production domain.

## Known issues

**The animation renders in `pnpm dev` again**, so the `pnpm build && pnpm start` workaround this section used to describe is no longer needed. [#16](https://github.com/danlesko/landesko-playground/issues/16) is closed: p5 1.x's minified bundle fails to parse under Turbopack, and `next.config.ts` aliases `p5` to the unminified build to avoid it. Do not remove that alias — the comment there explains what breaks, and the failure only ever appeared in dev, so nothing in CI would catch its return.

**`pnpm audit` is not clean, and one entry is deliberate.** `sharp` carries a high-severity advisory for inherited libvips CVEs, patched in a version outside the range `next` declares. It is accepted rather than overridden, because nothing in this app lets a visitor control the bytes the image optimizer decodes — no uploads, no image proxy, and no configured `remotePatterns`. The reasoning and its limits are in [#123](https://github.com/danlesko/landesko-playground/pull/123) and in `next.config.ts`. The remaining advisories are dev-only, in lint and build tooling.

**Dependency majors are behind on purpose**, one tracked issue each: Tailwind 4 ([#124](https://github.com/danlesko/landesko-playground/issues/124)), Next 16 ([#125](https://github.com/danlesko/landesko-playground/issues/125)), zod 4 ([#126](https://github.com/danlesko/landesko-playground/issues/126)), ESLint 10 ([#127](https://github.com/danlesko/landesko-playground/issues/127)), TypeScript 7 ([#128](https://github.com/danlesko/landesko-playground/issues/128)), p5 2 ([#129](https://github.com/danlesko/landesko-playground/issues/129)) and a batch of the rest ([#130](https://github.com/danlesko/landesko-playground/issues/130)). Each issue records the repo-side surface that actually breaks rather than just the version numbers.

**Some tests are skipped for want of credentials**, and a skipped test is a declared gap rather than coverage: the `/contact` delivery path needs a real reCAPTCHA key and mail credentials, and the blog specs that read rows need a database. Neither belongs in this repository.
