import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      reason: "disabled",
      message: "Calendar sync is currently disabled.",
    },
    { status: 410 },
  );
}
