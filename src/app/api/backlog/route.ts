import { NextResponse } from "next/server";
import { spreadBacklog } from "@/lib/backlog";

/** POST /api/backlog — "I was away": spread the due pile gently. */
export async function POST() {
  const result = await spreadBacklog();
  return NextResponse.json(result);
}
