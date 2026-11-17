import { createRequestHandler } from "react-router";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

const BUILD_ID = "connect-rta-auth-test-v1";

const ORIGIN = "https://rta.gov.bd";

const ALLOWED_ORIGINS = new Set([
  "https://rta.gov.bd",
  "https://www.rta.gov.bd",
]);

const ROUTES: Record<string, string> = {
  "POST /api/mobile/auth/login": "/api/mobile/auth/login",
  "GET /api/mobile/auth/profile": "/api/mobile/auth/profile",
};

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Accept, Authorization, Content-Type, X-Requested-With",
    );
    headers.set("Access-Control-Max-Age", "600");
  }

  return headers;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (url.pathname.startsWith("/api/mobile/auth/")) {
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return Response.json(
          { message: "Origin not allowed." },
          { status: 403 },
        );
      }

      if (request.method === "OPTIONS") {
        const headers = corsHeaders(origin);

        if (origin && !headers.has("Access-Control-Allow-Origin")) {
          return Response.json(
            { message: "Origin not allowed." },
            { status: 403 },
          );
        }

        return new Response(null, {
          status: 204,
          headers,
        });
      }

      const routeKey = `${request.method} ${url.pathname}`;
      const destinationPath = ROUTES[routeKey];

      if (!destinationPath) {
        return Response.json(
          { message: "Route or method not allowed by test gateway." },
          { status: 405 },
          );
      }

      try {
        const headers = new Headers();

        for (const name of [
          "Accept",
          "Content-Type",
          "Authorization",
          "X-Requested-With",
        ]) {
          const value = request.headers.get(name);
          if (value) headers.set(name, value);
        }

        const target = new URL(destinationPath, ORIGIN);

        const upstreamRequest = new Request(target, {
          method: request.method,
          headers,
          body: request.method === "GET" ? undefined : request.body,
          redirect: "manual",
        });

        const upstreamResponse = await fetch(upstreamRequest);

        const responseHeaders = new Headers();

        for (const name of [
          "Content-Type",
          "Cache-Control",
          "WWW-Authenticate",
        ]) {
          const value = upstreamResponse.headers.get(name);
          if (value) responseHeaders.set(name, value);
        }

        for (const [name, value] of corsHeaders(origin)) {
          responseHeaders.set(name, value);
        }

        responseHeaders.set("X-Connect-RTA-Gateway", BUILD_ID);

        return new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          headers: responseHeaders,
        });
      } catch {
        return Response.json(
          {
            message: "The test gateway could not reach the RTA API.",
            gateway_build: BUILD_ID,
          },
          { status: 502 },
        );
      }
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
