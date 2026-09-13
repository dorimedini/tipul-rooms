import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateOccurrences, formatDateForDB, doTimesOverlap, hoursViolation } from "@/lib/allocations";
import { parseISO } from "date-fns";

/** Postgres unique-violation (23505) surfaced as something a therapist can act on. */
function describeInsertError(err: { code?: string; message: string }): string {
  if (err.code === "23505") {
    return "That slot is already taken in this room. Reload the calendar and try again.";
  }
  return err.message;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!caller?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { roomId, date, startTime, durationMinutes, title, recurring, seriesEnd, ownerId } = body;

  // The allocation's user_id is its owner — the therapist the slot is for,
  // picked in the booking dialog. It carries no permission over the booking.
  const userId: string = ownerId ?? user.id;
  const { data: owner } = await supabase
    .from("profiles").select("id").eq("id", userId).single();
  if (!owner) return NextResponse.json({ error: "Unknown owner" }, { status: 400 });

  // Opening hours. A recurring series repeats on one weekday, so a single check
  // covers every occurrence.
  const dayOfWeekForBooking = parseISO(date).getDay();
  const { data: roomHours } = await supabase
    .from("room_hours").select("day_of_week, open_time, close_time").eq("room_id", roomId);

  const violation = hoursViolation(roomHours ?? [], dayOfWeekForBooking, startTime, durationMinutes);
  if (violation) {
    return NextResponse.json(
      { error: `Outside opening hours — ${violation}.` },
      { status: 409 }
    );
  }

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
        user_id: userId,
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
        user_id: userId,
        room_id: roomId,
        date: formatDateForDB(d),
        start_time: startTime,
        duration_minutes: durationMinutes,
        title: title ?? null,
      }))
    );

    if (insertErr) {
      // Don't leave a series row behind with no occurrences under it.
      await supabase.from("allocation_series").delete().eq("id", series.id);
      return NextResponse.json({ error: describeInsertError(insertErr) }, { status: 409 });
    }

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
      .insert({ user_id: userId, room_id: roomId, date, start_time: startTime, duration_minutes: durationMinutes, title: title ?? null })
      .select()
      .single();

    if (error) return NextResponse.json({ error: describeInsertError(error) }, { status: 409 });
    return NextResponse.json(data);
  }
}
