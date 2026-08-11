/**
 * Shared-secret tokens for the routes proxy.ts exempts from the cookie gate
 * (MCP, calendar feed). Fail CLOSED on a gated or production instance with a
 * missing token — "dev" is a convenience strictly for open local dev.
 */
export function sharedToken(envName: "MCP_TOKEN" | "CALENDAR_TOKEN"): string | null {
  const configured = process.env[envName];
  if (configured) return configured;
  if (process.env.APP_PASSWORD || process.env.NODE_ENV === "production") {
    return null; // gated instance without a token: nothing may pass
  }
  return "dev";
}
