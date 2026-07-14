import { NextResponse } from "next/server";

// Wrap an API route handler so an unexpected error (DB down, bad state, bug)
// returns a clean JSON 500 instead of an unhandled crash. Usage:
//
//   export const GET = guarded(async () => { ... });
//
type RouteHandler<T extends unknown[]> = (...args: T) => Promise<Response>;

export function guarded<T extends unknown[]>(handler: RouteHandler<T>): RouteHandler<T> {
  return async (...args: T) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error("[api error]", err); // full details stay on the server
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }
  };
}
