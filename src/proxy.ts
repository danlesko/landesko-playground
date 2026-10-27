import { auth } from "@/auth";
import { isOwner } from "@/lib/owner";

export default auth((req) => {
  // The same predicate actions.ts enforces, so nobody is shown a form whose every
  // submit would be rejected.
  if (!isOwner(req.auth)) {
    const newUrl = new URL("/", req.nextUrl.origin);
    return Response.redirect(newUrl);
  }
});

export const config = {
  matcher: "/blog/create",
};
