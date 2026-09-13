export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScheduleApp } from "@/components/ScheduleApp";
import { computeHolidays } from "@/lib/holidays.server";
import { addMonths, format } from "date-fns";

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
    supabase.from("rooms").select("*, locations(*), room_hours(*)").order("name"),
    supabase.from("profiles").select("*").order("name"),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
  ]);

  if (!profile) redirect("/unauthorized");

  // Record login time (used to verify admin credential control)
  await supabase.rpc("touch_last_login");

  // Holidays travel with the page instead of costing a request per week. The
  // window generously covers the ~10-month booking horizon; weeks outside it
  // fall back to /api/holidays.
  const holidayStart = addMonths(new Date(), -3);
  const holidayEnd = addMonths(new Date(), 15);

  return (
    <ScheduleApp
      currentUser={profile}
      locations={locations ?? []}
      rooms={(rooms ?? []) as any}
      allProfiles={profiles ?? []}
      initialHolidays={computeHolidays(holidayStart, holidayEnd)}
      holidayRange={{
        start: format(holidayStart, "yyyy-MM-dd"),
        end: format(holidayEnd, "yyyy-MM-dd"),
      }}
    />
  );
}
