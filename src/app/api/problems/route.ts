import { NextResponse } from "next/server";
import { parsedSummarySchema } from "@/lib/types";
import { saveParsedSummary } from "@/lib/data";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const check = parsedSummarySchema.safeParse(body?.parsed);
  if (!check.success) {
    return NextResponse.json(
      { error: "Invalid problem data", details: check.error.flatten() },
      { status: 400 }
    );
  }
  // The parser's placeholder title would give every header-less summary the
  // same slug, silently merging unrelated problems.
  if (/^untitled problem$/i.test(check.data.title.trim())) {
    return NextResponse.json(
      { error: "Give the problem a real title before saving." },
      { status: 400 }
    );
  }
  const solvedAt = body?.solvedAt ? new Date(body.solvedAt) : new Date();
  if (Number.isNaN(solvedAt.getTime())) {
    return NextResponse.json({ error: "Invalid solvedAt date" }, { status: 400 });
  }
  const result = await saveParsedSummary({ ...check.data }, solvedAt);
  return NextResponse.json(result);
}
