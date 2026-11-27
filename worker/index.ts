/**
 * Cloudflare Worker in front of the static game. Everything is served from the built files except
 * /ingest/*, which is passed on to PostHog so the stats come from the game's own address (ad and
 * tracker blockers usually block third-party analytics hosts, not first-party paths).
 * The player's IP address and cookies are not forwarded.
 */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  POSTHOG_HOST?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/ingest/")) return env.ASSETS.fetch(request);
    if (request.method !== "POST" && request.method !== "OPTIONS") return new Response("Not found", { status: 404 });
    const upstream = new URL((env.POSTHOG_HOST ?? "https://us.i.posthog.com") + url.pathname.slice("/ingest".length) + url.search);
    const headers = new Headers();
    headers.set("content-type", request.headers.get("content-type") ?? "text/plain");
    headers.set("user-agent", request.headers.get("user-agent") ?? "tide-weaver");
    const res = await fetch(upstream, { method: request.method, headers, body: request.method === "POST" ? request.body : undefined });
    return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
  },
};
