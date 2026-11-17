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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Temporary, read-only origin connectivity diagnostic.
    if (url.pathname === "/_origin_probe") {
      if (request.method !== "GET") {
        return Response.json(
          { error: "Method not allowed" },
          { status: 405, headers: { Allow: "GET" } },
        );
      }

      try {
        const originUrl =
          "https://rta.gov.bd/api/mobile/auth/profile";

        const originResponse = await fetch(originUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "ConnectRTA-Worker-Probe/1.0",
          },
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
        });

        const body = await originResponse.text();

        return Response.json({
          diagnostic: "Connect RTA origin probe",
          origin_url: originUrl,
          origin_status: originResponse.status,
          origin_status_text: originResponse.statusText,
          content_type: originResponse.headers.get("content-type"),
          server: originResponse.headers.get("server"),
          body_preview: body.slice(0, 500),
        });
      } catch (error) {
        return Response.json(
          {
            diagnostic: "Connect RTA origin probe",
            error: error instanceof Error ? error.message : String(error),
          },
          { status: 502 },
        );
      }
    }

    // All other requests continue to the original React Router application.
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
