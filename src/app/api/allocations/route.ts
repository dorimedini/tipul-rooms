import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateOccurrences, formatDateForDB, doTimesOverlap } from "@/lib/allocations";
import { parseISO } from "date-fns";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { roomId, date, startTime, durationMinutes, title, recurring, seriesEnd } = body;

  if (recurring) {
    const start = parseISO(date);
    const end = parseISO(seriesEnd);
    const dayOfWeek = start.getDay();
    const dates = generateOccurrences(start, end, dayOfWeek);

    // Check for conflicts across all dates
    const { data: existingAll } = await supabase
      .from("allocations")
      .select("date, start_time, duration_minutes")
      .eq("room_id", roomId)
      .eq("status", "active")
      .in("date", dates.map(formatDateForDB));

    const conflicts = (existingAll ?? []).filter(ex =>
      doTimesOverlap(startTime, durationMinutes, ex.start_time, ex.duration_minutes)
    );

    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: "Conflicts detected", conflicts: conflicts.map(c => c.date) },
        { status: 409 }
      );
    }

    // Create the series record
    const { data: series, error: seriesErr } = await supabase
      .from("allocation_series")
      .insert({
        user_id: user.id,
        room_id: roomId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        duration_minutes: durationMinutes,
        series_start: formatDateForDB(start),
        series_end: formatDateForDB(end),
      })
      .select()
      .single();

    if (seriesErr) return NextResponse.json({ error: seriesErr.message }, { status: 500 });

    // Insert individual allocations
    const { error: insertErr } = await supabase.from("allocations").insert(
      dates.map(d => ({
        series_id: series.id,
        user_id: user.id,
        room_id: roomId,
        date: formatDateForDB(d),
        start_time: startTime,
        duration_minutes: durationMinutes,
        title: title ?? null,
      }))
    );

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    return NextResponse.json({ series, count: dates.length });
  } else {
    // Single allocation
    const { data: existing } = await supabase
      .from("allocations")
      .select("id, start_time, duration_minutes")
      .eq("room_id", roomId)
      .eq("date", date)
      .eq("status", "active");

    const conflict = (existing ?? []).find(ex =>
      doTimesOverlap(startTime, durationMinutes, ex.start_time, ex.duration_minutes)
    );
    if (conflict) {
      return NextResponse.json({ error: "Time slot already booked" }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("allocations")
      .insert({ user_id: user.id, room_id: roomId, date, start_time: startTime, duration_minutes: durationMinutes, title: title ?? null })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }
}
