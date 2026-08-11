import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { lists } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { USER_ID } from "@/lib/data";
import { setSetting } from "@/lib/recommend";

const inputSchema = z.object({
  key: z.enum(["active_list", "daily_review_goal"]),
  value: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const check = inputSchema.safeParse(body);
  if (!check.success) {
    return NextResponse.json({ error: "Invalid setting" }, { status: 400 });
  }
  const { key, value } = check.data;

  if (key === "active_list") {
    const exists = await db
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.userId, USER_ID), eq(lists.slug, value)))
      .get();
    if (!exists) {
      return NextResponse.json({ error: "Unknown list" }, { status: 400 });
    }
  }
  if (key === "daily_review_goal") {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      return NextResponse.json(
        { error: "Goal must be a whole number from 1 to 50" },
        { status: 400 }
      );
    }
  }

  await setSetting(key, value);
  return NextResponse.json({ ok: true });
}
