import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateOccurrences, formatDateForDB, doTimesOverlap } from "@/lib/allocations";
import { parseISO } from "date-fns";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { action } = body;

  // Fetch the allocation
  const { data: allocation, error: fetchErr } = await supabase
    .from("allocations")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !allocation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (allocation.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (action === "cancel_single") {
    const { error } = await supabase
      .from("allocations")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel_from_here") {
    // Cancel this and all future allocations in the same series
    if (!allocation.series_id) {
      // No series, just cancel this one
      await supabase.from("allocations").update({ status: "cancelled" }).eq("id", id);
      return NextResponse.json({ ok: true, cancelled: 1 });
    }

    const { data: cancelled, error } = await supabase
      .from("allocations")
      .update({ status: "cancelled" })
      .eq("series_id", allocation.series_id)
      .gte("date", allocation.date)
      .eq("status", "active")
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, cancelled: cancelled?.length ?? 0 });
  }

  if (action === "move_from_here") {
    const { newRoomId, newStartTime, newDurationMinutes } = body;
    if (!allocation.series_id) {
      return NextResponse.json({ error: "No series to move" }, { status: 400 });
    }

    // Get all future allocations in the series
    const { data: futureAllocations } = await supabase
      .from("allocations")
      .select("*")
      .eq("series_id", allocation.series_id)
      .gte("date", allocation.date)
      .eq("status", "active");

    if (!futureAllocations?.length) {
      return NextResponse.json({ ok: true, moved: 0, collisions: [] });
    }

    const dates = futureAllocations.map(a => a.date);

    // Check conflicts on target room
    const { data: existingOnTarget } = await supabase
      .from("allocations")
      .select("date, start_time, duration_minutes, user_id")
      .eq("room_id", newRoomId)
      .eq("status", "active")
      .in("date", dates)
      .neq("series_id", allocation.series_id); // exclude self

    const collisionDates = (existingOnTarget ?? [])
      .filter(ex => doTimesOverlap(newStartTime, newDurationMinutes, ex.start_time, ex.duration_minutes))
      .map(ex => ex.date);

    const movableDates = dates.filter(d => !collisionDates.includes(d));
    const movableIds = futureAllocations
      .filter(a => movableDates.includes(a.date))
      .map(a => a.id);

    if (movableIds.length > 0) {
      await supabase
        .from("allocations")
        .update({ room_id: newRoomId, start_time: newStartTime, duration_minutes: newDurationMinutes })
        .in("id", movableIds);
    }

    return NextResponse.json({
      ok: true,
      moved: movableIds.length,
      collisions: collisionDates,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
