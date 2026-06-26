export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScheduleApp } from "@/components/ScheduleApp";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: locations },
    { data: rooms },
    { data: profiles },
    { data: profile },
  ] = await Promise.all([
    supabase.from("locations").select("*").order("name"),
    supabase.from("rooms").select("*, locations(*)").order("name"),
    supabase.from("profiles").select("*").order("name"),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
  ]);

  if (!profile) redirect("/unauthorized");

  // Record login time (used to verify admin credential control)
  await supabase.rpc("touch_last_login");

  return (
    <ScheduleApp
      currentUser={profile}
      locations={locations ?? []}
      rooms={(rooms ?? []) as any}
      allProfiles={profiles ?? []}
    />
  );
}
