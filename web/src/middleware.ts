import { NextResponse, type NextRequest } from "next/server";

// Edge guard: presence-check the session cookie and redirect to /login when
// absent. Real validation happens server-side in the API guard on every call;
// this just keeps unauthenticated users out of the app shell.
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("session");
  const { pathname } = req.nextUrl;
  const isLogin = pathname.startsWith("/login");

  if (!hasSession && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

// Exclude Next internals and static assets from the guard.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|site.webmanifest|garbos-[\\w-]+\\.(?:png|svg)).*)",
  ],
};
