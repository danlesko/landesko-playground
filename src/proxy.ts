import { auth } from "@/auth";

export default auth((req) => {
  // `req.auth?.user`, not `req.auth`: `Session.user` is optional in @auth/core's
  // types, so a session with no user would render the authoring form here while
  // actions.ts rejects every submit. Same predicate as data.ts and actions.ts.
  if (!req.auth?.user) {
    const newUrl = new URL("/", req.nextUrl.origin);
    return Response.redirect(newUrl);
  }
});

export const config = {
  matcher: "/blog/create",
};
