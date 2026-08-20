import { auth } from "@/auth";

export default auth((req) => {
  // `req.auth?.user`, not `req.auth`: `Session.user` is optional in
  // @auth/core's types, so a session object carrying no user would otherwise
  // pass this gate and render the authoring form, while `createBlog` and
  // `updateBlog` in lib/actions.ts check `session?.user` and reject every
  // submit as Unauthorized. Middleware, read path, write path and UI all use
  // the same predicate so they cannot drift apart.
  if (!req.auth?.user) {
    const newUrl = new URL("/", req.nextUrl.origin);
    return Response.redirect(newUrl);
  }
});

export const config = {
  matcher: "/blog/create",
};
