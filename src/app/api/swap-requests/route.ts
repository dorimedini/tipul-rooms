import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emailSwapRequest } from "@/lib/email";
import { format } from "date-fns";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requesterAllocationId, targetAllocationId } = await req.json();

  // Verify requester owns their allocation
  const { data: reqAlloc } = await supabase
    .from("allocations")
    .select("user_id")
    .eq("id", requesterAllocationId)
    .single();

  if (!reqAlloc || reqAlloc.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check no existing pending request
  const { data: existing } = await supabase
    .from("swap_requests")
    .select("id")
    .eq("requester_allocation_id", requesterAllocationId)
    .eq("target_allocation_id", targetAllocationId)
    .eq("status", "pending");

  if (existing?.length) {
    return NextResponse.json({ error: "Swap request already pending" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("swap_requests")
    .insert({
      requester_id: user.id,
      requester_allocation_id: requesterAllocationId,
      target_allocation_id: targetAllocationId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Email the target user — fetch full details for both allocations
  const [{ data: reqDetails }, { data: tgtDetails }, { data: requesterProfile }] = await Promise.all([
    supabase.from("allocations").select("date, start_time, rooms(name, locations(name))").eq("id", requesterAllocationId).single(),
    supabase.from("allocations").select("date, start_time, rooms(name, locations(name)), profiles(name, email)").eq("id", targetAllocationId).single(),
    supabase.from("profiles").select("name").eq("id", user.id).single(),
  ]);

  if (tgtDetails && reqDetails && requesterProfile) {
    const fmt = (a: any) =>
      `${format(a.date, "EEE MMM d")} ${a.start_time.slice(0, 5)} · ${(a.rooms as any)?.locations?.name} / ${(a.rooms as any)?.name}`;
    emailSwapRequest({
      toEmail: (tgtDetails.profiles as any).email,
      toName: (tgtDetails.profiles as any).name,
      requesterName: requesterProfile.name,
      requesterSlot: fmt(reqDetails),
      targetSlot: fmt(tgtDetails),
    });
  }

  return NextResponse.json(data);
}
