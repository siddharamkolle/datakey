import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const path = request.nextUrl.pathname;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    request.nextUrl.protocol.replace(":", "");
  const isHttps = proto === "https";

  const hasTurnstile = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const isPublicPage = path === "/" || path.startsWith("/k/");

  const scriptSrc =
    isPublicPage && hasTurnstile
      ? `'self' 'unsafe-inline' https://challenges.cloudflare.com ${isDev ? "'unsafe-eval'" : ""}`
      : `'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""}`;

  const frameSrc =
    isPublicPage && hasTurnstile
      ? `'self' https://challenges.cloudflare.com`
      : `'none'`;

  const cspDirectives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self' data:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-src ${frameSrc}`,
    `frame-ancestors 'none'`,
    `connect-src 'self' https://challenges.cloudflare.com`,
    ...(isHttps ? [`upgrade-insecure-requests`] : []),
  ];

  const cspHeader = cspDirectives.join("; ");

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)"
  );

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
