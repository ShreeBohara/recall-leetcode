import { NextResponse, type NextRequest } from "next/server";

/**
 * Passphrase gate for the deployed app. Only active when APP_PASSWORD is set —
 * local dev without it stays open. The MCP endpoint and calendar feed carry
 * their own tokens, so they bypass the cookie check.
 */
export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = request.nextUrl;
  // /.well-known must fall through to clean 404s: MCP clients probe OAuth
  // discovery there, and a login redirect makes them think an OAuth
  // sign-in service exists (breaking authless connector setup).
  if (
    pathname.startsWith("/api/mcp") ||
    pathname.startsWith("/api/calendar") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/.well-known")
  ) {
    return NextResponse.next();
  }

  if (request.cookies.get("recall_auth")?.value === password) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
