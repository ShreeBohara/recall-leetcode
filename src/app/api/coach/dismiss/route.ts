import { NextResponse } from "next/server";
import { z } from "zod";
import { dismissCoachReport } from "@/lib/coach";

const input = z.object({ id: z.number().int().positive() });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const check = input.safeParse(body);
  if (!check.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  await dismissCoachReport(check.data.id);
  return NextResponse.json({ ok: true });
}
