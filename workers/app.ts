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

const DIAGNOSTIC_BUILD = "connect-rta-origin-probe-2026-11-17-v2";

async function probe(url: string) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/html;q=0.9, */*;q=0.8",
        "User-Agent": "ConnectRTA-Worker-Probe/2.0",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });

    const body = await response.text();

    return {
      requested_url: url,
      status: response.status,
      status_text: response.statusText,
      content_type: response.headers.get("content-type"),
      server: response.headers.get("server"),
      location: response.headers.get("location"),
      cf_ray: response.headers.get("cf-ray"),
      response_preview: body.slice(0, 350),
    };
  } catch (error) {
    return {
      requested_url: url,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/_origin_probe") {
      if (request.method !== "GET") {
        return Response.json(
          { error: "Method not allowed" },
          { status: 405, headers: { Allow: "GET" } },
        );
      }

      const targets = [
        "https://rta.gov.bd/up",
        "https://rta.gov.bd/api/mobile/auth/profile",
        "https://www.rta.gov.bd/api/mobile/auth/profile",
      ];

      const results = await Promise.all(targets.map(probe));

      return Response.json(
        {
          diagnostic: "Connect RTA three-endpoint origin probe",
          build_id: DIAGNOSTIC_BUILD,
          tested_at: new Date().toISOString(),
          results,
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        },
      );
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
