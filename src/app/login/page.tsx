"use client";
import { Input, Button } from "@rewind-ui/core";

import { useActionState } from "react";
import { authenticate } from "@/src/app/lib/actions";
import { useSearchParams } from "next/navigation";
import { auth } from "@/auth";

const Login = () => {
  console.log("auth", auth);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/blog/create";
  const [errorMessage, formAction, isPending] = useActionState(
    authenticate,
    undefined,
  );

  return (
    <>
      <h2 className="text-4xl font-bold">Login</h2>
      <form
        action={formAction}
        className="text-lg mt-2 md:w-full lg:min-w-[600px] lg:w-1/4 h-1/2"
      >
        <Input
          required
          type="email"
          name="email"
          color="purple"
          placeholder="Email"
          className="bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0 mt-1"
        />
        <Input
          required
          type="password"
          name="password"
          color="purple"
          placeholder="Password"
          className="bg-zinc-800 text-zinc-300 focus:bg-zinc-800 focus:text-zinc-300 focus:ring-zinc-800 focus:ring-0 focus:ring-offset-0 mt-1"
        />
        <input type="hidden" name="redirectTo" value={callbackUrl} />
        <Button
          type="submit"
          disabled={isPending}
          variant="primary"
          className="mt-1"
        >
          Login
        </Button>
        {errorMessage && (
          <>
            <p className="text-sm text-red-500">{errorMessage}</p>
          </>
        )}
      </form>
    </>
  );
};

export default Login;
