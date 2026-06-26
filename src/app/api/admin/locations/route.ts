import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { supabase, user, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { supabase, user, error: null };
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdmin();
  if (error) return error;

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const { data, error: err } = await supabase
    .from("locations").insert({ name: name.trim() }).select().single();
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });
  return NextResponse.json(data);
}
