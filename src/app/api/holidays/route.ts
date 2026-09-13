import { NextRequest, NextResponse } from "next/server";
import { parseISO } from "date-fns";
import { computeHolidays } from "@/lib/holidays.server";

// Fallback for weeks outside the window the page precomputes; the common case
// never reaches this route.
export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "start and end required" }, { status: 400 });
  }

  return NextResponse.json(
    { holidays: computeHolidays(parseISO(start), parseISO(end)) },
    { headers: { "Cache-Control": "private, max-age=86400" } }
  );
}
