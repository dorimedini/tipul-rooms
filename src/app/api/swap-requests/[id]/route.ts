import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { action } = await req.json(); // "accept" | "decline" | "cancel"

  const { data: swapReq } = await supabase
    .from("swap_requests")
    .select(`
      *,
      requester_allocation:allocations!requester_allocation_id(*),
      target_allocation:allocations!target_allocation_id(*)
    `)
    .eq("id", id)
    .single();

  if (!swapReq) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const req2 = swapReq as any;
  const reqAlloc = req2.requester_allocation;
  const tgtAlloc = req2.target_allocation;

  if (action === "cancel") {
    if (req2.requester_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await supabase.from("swap_requests").update({ status: "cancelled" }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    if (tgtAlloc.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await supabase.from("swap_requests").update({ status: "declined" }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  if (action === "accept") {
    if (tgtAlloc.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Swap: exchange room_id, start_time, duration_minutes between the two allocations
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("allocations").update({
        room_id: tgtAlloc.room_id,
        start_time: tgtAlloc.start_time,
        duration_minutes: tgtAlloc.duration_minutes,
        date: tgtAlloc.date,
      }).eq("id", reqAlloc.id),
      supabase.from("allocations").update({
        room_id: reqAlloc.room_id,
        start_time: reqAlloc.start_time,
        duration_minutes: reqAlloc.duration_minutes,
        date: reqAlloc.date,
      }).eq("id", tgtAlloc.id),
    ]);

    if (e1 || e2) return NextResponse.json({ error: "Swap failed" }, { status: 500 });

    await supabase.from("swap_requests").update({ status: "accepted" }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
