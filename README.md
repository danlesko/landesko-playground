This is Dan Lesko's personal website written in [Next.js 15](https://nextjs.org). The goal of creating this website was to learn the new feature's of Next.js, including but not limited to learning how to use the app router, layouts, and [Auth.js](https://authjs.dev/), previously known as Next Auth.

## Stack

- [Next.js 15](https://nextjs.org) App Router, React 19, TypeScript
- [Tailwind CSS](https://tailwindcss.com/) for styling, with [Rewind UI](https://rewind-ui.dev/) used minimally for form controls
- [Auth.js](https://authjs.dev/) (`next-auth` v5) with GitHub as the only provider
- Postgres via `@vercel/postgres`, hosted on [Neon](https://neon.tech)
- [p5.js](https://p5js.org/) (through `react-p5-wrapper`) for the animation page
- [EmailJS](https://www.emailjs.com/) and [reCAPTCHA](https://developers.google.com/recaptcha) behind the contact form

## Running the page locally

Requires Node 20 or newer (CI runs 22) and [pnpm](https://pnpm.io).

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

The three prefixed EmailJS values are currently readable by the browser. Moving them server-side is tracked in [#14](https://github.com/danlesko/landesko-playground/issues/14).

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

The animation does not render under `pnpm dev` — the p5 chunk throws a `SyntaxError` in development only. Production builds are unaffected, so use `pnpm build && pnpm start` to work on it. Tracked in [#16](https://github.com/danlesko/landesko-playground/issues/16).
