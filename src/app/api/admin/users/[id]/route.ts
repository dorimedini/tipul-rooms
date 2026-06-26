import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!caller?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { action } = await req.json(); // "grant_admin" | "revoke_admin" | "relinquish_self"

  if (action === "grant_admin") {
    const { error } = await supabase
      .from("profiles").update({ is_admin: true }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "revoke_admin") {
    // Cannot revoke self via this action — use relinquish_self
    if (id === user.id) {
      return NextResponse.json({ error: "Use relinquish_self to remove your own admin status" }, { status: 400 });
    }
    // Ensure at least one other admin remains
    const { data: otherAdmins } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_admin", true)
      .neq("id", id);

    if (!otherAdmins?.length) {
      return NextResponse.json({ error: "Cannot revoke: this is the last admin" }, { status: 409 });
    }

    const { error } = await supabase
      .from("profiles").update({ is_admin: false }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "relinquish_self") {
    if (id !== user.id) {
      return NextResponse.json({ error: "Can only relinquish your own admin status" }, { status: 400 });
    }

    // Require another admin who has proven control (logged in at least once)
    const { data: otherQualifiedAdmins } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_admin", true)
      .neq("id", user.id)
      .not("last_login_at", "is", null);

    if (!otherQualifiedAdmins?.length) {
      return NextResponse.json(
        { error: "Cannot relinquish: no other admin has logged in yet" },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("profiles").update({ is_admin: false }).eq("id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
