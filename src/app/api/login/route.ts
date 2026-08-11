import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "No password configured" }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (body?.password !== password) {
    return NextResponse.json({ error: "Wrong passphrase" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("recall_auth", password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
  return res;
}
