import { POST as mcpPost } from "../route";

/**
 * Token-in-path variant of the MCP endpoint, for clients that can't send a
 * custom Authorization header (claude.ai's custom-connector UI). The path
 * token is promoted to the bearer header and validated by the main handler —
 * same secret, same auth, different envelope. Mirrors the ICS feed pattern.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${token}`);
  const body = await request.arrayBuffer();
  return mcpPost(new Request(request.url, { method: "POST", headers, body }));
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}
export async function DELETE() {
  return new Response("Method Not Allowed", { status: 405 });
}
export { OPTIONS } from "../route";
