import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { logEdgeRequest } from "@/lib/edge-logger";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]
        ) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  // Log every request (fire-and-forget). Skip the logs endpoints so the
  // logs page's own polling doesn't spam the table.
  if (!request.nextUrl.pathname.startsWith("/api/logs")) {
    const userId = session?.user?.id ?? null;
    logEdgeRequest({
      level: "info",
      source: "request",
      message: `${request.method} ${request.nextUrl.pathname}${request.nextUrl.search}`,
      details: {
        userId,
        auth: !!session,
        userAgent: request.headers.get("user-agent"),
        ip:
          request.headers.get("x-forwarded-for") ??
          request.headers.get("x-real-ip"),
        referer: request.headers.get("referer"),
      },
    });
  }

  // Public routes
  const publicPaths = [
    "/login",
    "/api/auth/callback",
    "/api/auth/google-callback",
    "/api/auth/microsoft-callback",
  ];
  const isPublicPath = publicPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );

  if (!session && !isPublicPath) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value));
    return redirect;
  }

  if (session && request.nextUrl.pathname === "/login") {
    const redirect = NextResponse.redirect(new URL("/chat", request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
