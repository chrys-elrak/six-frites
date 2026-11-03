import { type NextRequest, NextResponse } from "next/server";
import { SIGNED_IN_COOKIE } from "@/lib/site";

export function proxy(req: NextRequest) {
  if (!req.cookies.has(SIGNED_IN_COOKIE)) return NextResponse.rewrite(new URL("/welcome", req.url));
}

export const config = { matcher: "/" };
