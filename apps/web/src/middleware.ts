import { NextResponse, type NextRequest } from "next/server";

/**
 * Coarse routing guard based on cookie *presence* only — it improves UX by avoiding a flash
 * of protected UI. Real authentication and authorization are enforced by the API on every
 * request; a forged cookie gets nothing but 401s.
 */
const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/invite"];
const AUTH_ONLY_PATHS = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("tp_session")?.value);
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  if (hasSession && AUTH_ONLY_PATHS.includes(pathname) && !request.nextUrl.searchParams.has("next")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
