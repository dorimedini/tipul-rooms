import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emailUnregisteredLogin } from "@/lib/email";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Must be authenticated (real Google session) but have no profile
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("id").eq("id", user.id).single();
  if (profile) return NextResponse.json({ error: "Already registered" }, { status: 400 });

  // Email all admins
  const { data: admins } = await supabase
    .from("profiles").select("email").eq("is_admin", true);

  if (admins?.length) {
    emailUnregisteredLogin({
      toEmails: admins.map(a => a.email),
      attemptedEmail: user.email ?? "unknown",
    });
  }

  return NextResponse.json({ ok: true });
}
