import { cache } from "react";
import { auth } from "@/auth";

/**
 * The request's session, read once.
 *
 * `auth()` verifies the session JWT out of a cookie on every call, so each
 * caller that invokes it directly does that work again. The root layout renders
 * on every route, which means a page that also needs the session — `/blog` and
 * `/blog/[id]` both do — verified twice per request.
 *
 * `cache` only memoizes calls made through the wrapper it returns, so importing
 * `auth` and calling it bypasses this entirely. That is why this exists as one
 * exported const rather than a `cache(auth)` written at each site: `cache`
 * returns a *new* memo per call, so two of those would be two memos.
 *
 * The reason to share it is not the decrypt, which is cheap. It is that two
 * reads can disagree — a session that expires between the root layout and the
 * page would render a signed-in header above signed-out content. One read per
 * request cannot.
 *
 * Server actions keep the bare `auth()` on purpose: each action is its own
 * request, so there is nothing to share with, and a memo would only suggest
 * otherwise.
 */
export const getSession = cache(auth);
