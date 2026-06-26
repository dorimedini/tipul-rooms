import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { locationId, name, hours } = await req.json();
  // hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>

  if (!locationId || !name?.trim()) {
    return NextResponse.json({ error: "locationId and name required" }, { status: 400 });
  }

  const { data: room, error: roomErr } = await supabase
    .from("rooms").insert({ location_id: locationId, name: name.trim() }).select().single();
  if (roomErr) return NextResponse.json({ error: roomErr.message }, { status: 500 });

  if (hours?.length) {
    const { error: hoursErr } = await supabase.from("room_hours").insert(
      hours.map((h: { dayOfWeek: number; openTime: string; closeTime: string }) => ({
        room_id: room.id,
        day_of_week: h.dayOfWeek,
        open_time: h.openTime,
        close_time: h.closeTime,
      }))
    );
    if (hoursErr) return NextResponse.json({ error: hoursErr.message }, { status: 500 });
  }

  return NextResponse.json(room);
}
