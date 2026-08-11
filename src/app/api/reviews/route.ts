import { NextResponse } from "next/server";
import { z } from "zod";
import { logReview } from "@/lib/data";
import { computeRecords, diffRecords } from "@/lib/records";
import { GRADES } from "@/lib/types";

const reviewInputSchema = z.object({
  problemId: z.number().int().positive(),
  tier: z.enum(["approach_recall", "full_resolve"]).default("approach_recall"),
  grade: z.enum(GRADES),
  preConfidence: z.number().int().min(1).max(5).nullable().optional(),
  postConfidence: z.number().int().min(1).max(5).nullable().optional(),
  timeToApproachSec: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const check = reviewInputSchema.safeParse(body);
  if (!check.success) {
    return NextResponse.json(
      { error: "Invalid review data", details: check.error.flatten() },
      { status: 400 }
    );
  }
  // Records are decoration, never a reason to fail (or re-log) a review.
  let before: Awaited<ReturnType<typeof computeRecords>> | null = null;
  try {
    before = await computeRecords();
  } catch {}
  try {
    const result = await logReview(check.data);
    let newRecords: string[] = [];
    try {
      if (before) newRecords = diffRecords(before, await computeRecords());
    } catch {}
    return NextResponse.json({ ...result, newRecords });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to log review";
    // A genuine lookup miss is 404; "exists but retired from review" is a
    // conflict, not a server fault. Anything else is a server error.
    const status = /not found/i.test(message)
      ? 404
      : /retired from review/i.test(message)
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
