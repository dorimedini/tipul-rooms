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

  // Block if location still has rooms
  const { count } = await supabase
    .from("rooms").select("id", { count: "exact", head: true }).eq("location_id", id);
  if (count && count > 0) {
    return NextResponse.json(
      { error: `Remove all rooms in this location first (${count} remaining)` },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("locations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
