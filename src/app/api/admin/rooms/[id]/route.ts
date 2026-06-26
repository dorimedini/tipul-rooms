import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  // Block if room has active allocations
  const { count } = await supabase
    .from("allocations").select("id", { count: "exact", head: true })
    .eq("room_id", id).eq("status", "active");
  if (count && count > 0) {
    return NextResponse.json(
      { error: `Room has ${count} active allocation(s). Cancel them first.` },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { hours } = await req.json();
  // hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>

  // Replace all hours: delete existing, insert new
  await supabase.from("room_hours").delete().eq("room_id", id);

  if (hours?.length) {
    const { error } = await supabase.from("room_hours").insert(
      hours.map((h: { dayOfWeek: number; openTime: string; closeTime: string }) => ({
        room_id: id,
        day_of_week: h.dayOfWeek,
        open_time: h.openTime,
        close_time: h.closeTime,
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
