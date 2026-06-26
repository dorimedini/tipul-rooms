import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  return NextResponse.json(data);
}
