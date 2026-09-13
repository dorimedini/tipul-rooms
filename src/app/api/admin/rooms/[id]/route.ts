import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emailRoomRemoved, emailRoomHoursCollision } from "@/lib/email";
import { hoursViolation, formatDateForDB, minutesToTimeLabel } from "@/lib/allocations";
import { format, parseISO } from "date-fns";

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

  // Fetch room+location name before deleting
  const { data: roomDetails } = await supabase
    .from("rooms").select("name, locations(name)").eq("id", id).single();

  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Email all users
  const { data: allProfiles } = await supabase.from("profiles").select("email");
  if (roomDetails && allProfiles?.length) {
    await emailRoomRemoved({
      toEmails: allProfiles.map(p => p.email),
      roomName: roomDetails.name,
      locationName: (roomDetails.locations as any)?.name ?? "",
    });
  }

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
  const { name, hours } = await req.json();
  // hours: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>

  if (name !== undefined) {
    if (!name?.trim()) return NextResponse.json({ error: "Room name required" }, { status: 400 });
    const { error } = await supabase.from("rooms").update({ name: name.trim() }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Replace all hours: delete existing, insert new. Skipped entirely when the
  // caller sends no hours, so a name-only update can't wipe them.
  if (hours !== undefined) {
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

    // Existing bookings are never moved or cancelled by an hours change. Any that
    // now fall outside the new hours are reported to the admins instead.
    const newHours = (hours ?? []).map(
      (h: { dayOfWeek: number; openTime: string; closeTime: string }) => ({
        day_of_week: h.dayOfWeek,
        open_time: h.openTime,
        close_time: h.closeTime,
      })
    );

    const { data: upcoming } = await supabase
      .from("allocations")
      .select("date, start_time, duration_minutes, profiles(name)")
      .eq("room_id", id)
      .eq("status", "active")
      .gte("date", formatDateForDB(new Date()))
      .order("date")
      .order("start_time");

    const collisions = (upcoming ?? []).filter(
      a => hoursViolation(newHours, parseISO(a.date).getDay(), a.start_time, a.duration_minutes) !== null
    );

    if (collisions.length > 0) {
      const [{ data: roomDetails }, { data: admins }] = await Promise.all([
        supabase.from("rooms").select("name, locations(name)").eq("id", id).single(),
        supabase.from("profiles").select("email").eq("is_admin", true),
      ]);

      if (admins?.length) {
        await emailRoomHoursCollision({
          toEmails: admins.map(a => a.email),
          roomName: roomDetails?.name ?? "",
          locationName: (roomDetails?.locations as { name: string } | null)?.name ?? "",
          collisions: collisions.map(c => ({
            when: `${format(parseISO(c.date), "EEE MMM d")} ${c.start_time.slice(0, 5)}`,
            duration: minutesToTimeLabel(c.duration_minutes),
            owner: (c.profiles as unknown as { name: string } | null)?.name ?? "Unknown",
          })),
        });
      }

      return NextResponse.json({ ok: true, collisions: collisions.length });
    }
  }

  return NextResponse.json({ ok: true });
}
