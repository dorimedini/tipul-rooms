import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { blockCoversBooking } from "@/lib/allocations";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: caller } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!caller?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { date, startTime, endTime, title } = await req.json();
  if (!date || !startTime || !endTime || !title?.trim()) {
    return NextResponse.json({ error: "Date, time range and title are required" }, { status: 400 });
  }
  if (endTime <= startTime) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  const { data: block, error } = await supabase
    .from("holiday_blocks")
    .insert({ date, start_time: startTime, end_time: endTime, title: title.trim(), created_by: user.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A block closes every room in every location, so cancel whatever it covers —
  // one occurrence of a series, never the series itself.
  const { data: sameDay } = await supabase
    .from("allocations")
    .select("id, start_time, duration_minutes")
    .eq("date", date)
    .eq("status", "active");

  const covered = (sameDay ?? [])
    .filter(a => blockCoversBooking(
      { start_time: startTime, end_time: endTime }, a.start_time, a.duration_minutes))
    .map(a => a.id);

  if (covered.length > 0) {
    const { error: cancelErr } = await supabase
      .from("allocations").update({ status: "cancelled" }).in("id", covered);
    if (cancelErr) return NextResponse.json({ error: cancelErr.message }, { status: 500 });
  }

  return NextResponse.json({ block, cancelled: covered.length });
}
