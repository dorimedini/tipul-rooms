"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Location, Room, Profile, AllocationWithDetails, SwapRequestWithDetails } from "@/lib/supabase/types";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { BookingDialog } from "./BookingDialog";
import { AllocationActionDialog } from "./AllocationActionDialog";
import { SwapRequestsPanel } from "./SwapRequestsPanel";
import { AdminPanel } from "./AdminPanel";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { addWeeks, subWeeks, startOfWeek, endOfWeek, format, addDays } from "date-fns";

type RoomWithLocation = Room & { locations: Location };

interface Props {
  currentUser: Profile;
  locations: Location[];
  rooms: RoomWithLocation[];
  allProfiles: Profile[];
}

type SidePanel = "swaps" | "admin" | null;

export function ScheduleApp({ currentUser, locations, rooms, allProfiles }: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [selectedLocationId, setSelectedLocationId] = useState<string>(locations[0]?.id ?? "");
  const [allocations, setAllocations] = useState<AllocationWithDetails[]>([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequestWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDayIndex, setMobileDayIndex] = useState(() => new Date().getDay());
  const [calendarView, setCalendarView] = useState<"day" | "week">("week");

  const [bookingSlot, setBookingSlot] = useState<{ roomId: string; date: Date; startTime: string; durationMinutes?: number } | null>(null);
  const [actionAllocation, setActionAllocation] = useState<AllocationWithDetails | null>(null);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
  const allDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const displayDays = calendarView === "day" ? [allDays[mobileDayIndex]] : allDays;

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const fetchAllocations = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("allocations")
      .select("*, profiles(*), rooms(*, locations(*))")
      .gte("date", format(weekStart, "yyyy-MM-dd"))
      .lte("date", format(weekEnd, "yyyy-MM-dd"))
      .eq("status", "active")
      .order("date")
      .order("start_time");
    setAllocations((data ?? []) as unknown as AllocationWithDetails[]);
    setLoading(false);
  }, [weekStart]);

  const fetchSwapRequests = useCallback(async () => {
    const { data } = await supabase
      .from("swap_requests")
      .select(`
        *,
        requester:profiles!requester_id(*),
        requester_allocation:allocations!requester_allocation_id(*, profiles(*), rooms(*, locations(*))),
        target_allocation:allocations!target_allocation_id(*, profiles(*), rooms(*, locations(*)))
      `)
      .eq("status", "pending");
    setSwapRequests((data ?? []) as unknown as SwapRequestWithDetails[]);
  }, []);

  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);
  useEffect(() => { fetchSwapRequests(); }, [fetchSwapRequests]);

  const pendingSwapsCount = swapRequests.filter(
    s => (s.target_allocation as any)?.user_id === currentUser.id ||
         s.requester_id === currentUser.id
  ).length;

  const locationRooms = rooms.filter(r => r.location_id === selectedLocationId);

  function togglePanel(panel: SidePanel) {
    setSidePanel(prev => prev === panel ? null : panel);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function prevDay() {
    if (mobileDayIndex > 0) {
      setMobileDayIndex(i => i - 1);
    } else {
      setWeekStart(d => subWeeks(d, 1));
      setMobileDayIndex(6);
    }
  }

  function nextDay() {
    if (mobileDayIndex < 6) {
      setMobileDayIndex(i => i + 1);
    } else {
      setWeekStart(d => addWeeks(d, 1));
      setMobileDayIndex(0);
    }
  }

  function goToToday() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
    setMobileDayIndex(new Date().getDay());
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4">
        <div className="flex items-center justify-between py-2 md:py-3">
          <div className="flex items-center gap-2 md:gap-4">
            <h1 className="text-lg font-semibold text-gray-900">Tipul Rooms</h1>
            {/* Desktop: location tabs inline with title */}
            <nav className="hidden md:flex gap-1">
              {locations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocationId(loc.id)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    selectedLocationId === loc.id
                      ? "bg-blue-100 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {loc.name}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              variant={sidePanel === "swaps" ? "default" : "outline"}
              size="sm"
              onClick={() => togglePanel("swaps")}
            >
              Swaps
              {pendingSwapsCount > 0 && (
                <Badge className="ml-1.5 bg-orange-500 text-white text-xs px-1.5 py-0">
                  {pendingSwapsCount}
                </Badge>
              )}
            </Button>
            {currentUser.is_admin && (
              <Button
                variant={sidePanel === "admin" ? "default" : "outline"}
                size="sm"
                onClick={() => togglePanel("admin")}
              >
                Admin
              </Button>
            )}
            <span className="hidden md:inline text-sm text-gray-500">{currentUser.name}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>
          </div>
        </div>
        {/* Mobile: location tabs in a second row */}
        {locations.length > 1 && (
          <nav className="md:hidden flex gap-1 overflow-x-auto pb-2">
            {locations.map(loc => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocationId(loc.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
                  selectedLocationId === loc.id
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {loc.name}
              </button>
            ))}
          </nav>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto p-4">
          {/* Navigation bar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {/* Day/Week toggle */}
            <div className="flex rounded-md border overflow-hidden text-sm shrink-0">
              <button
                className={`px-3 py-1 ${calendarView === "day" ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-600"}`}
                onClick={() => setCalendarView("day")}
              >Day</button>
              <button
                className={`px-3 py-1 border-l ${calendarView === "week" ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-600"}`}
                onClick={() => setCalendarView("week")}
              >Week</button>
            </div>

            {/* Day view navigation */}
            {calendarView === "day" && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={prevDay}>←</Button>
                <span className="text-sm font-medium text-gray-700 min-w-[130px] text-center">
                  {format(allDays[mobileDayIndex], "EEE, MMM d")}
                </span>
                <Button variant="outline" size="sm" onClick={nextDay}>→</Button>
                <Button variant="ghost" size="sm" onClick={goToToday}>Today</Button>
              </div>
            )}

            {/* Week view navigation */}
            {calendarView === "week" && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setWeekStart(d => subWeeks(d, 1))}>←</Button>
                <span className="text-sm font-medium text-gray-700 min-w-[160px] text-center">
                  {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
                </span>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(d => addWeeks(d, 1))}>→</Button>
                <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}>Today</Button>
              </div>
            )}
          </div>

          {locationRooms.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              {locations.length === 0 ? "No locations configured yet." : "No rooms in this location."}
            </div>
          ) : (
            <WeeklyCalendar
              days={displayDays}
              rooms={locationRooms}
              allocations={allocations}
              currentUserId={currentUser.id}
              loading={loading}
              fitScreen={isMobile && calendarView === "week"}
              onSlotClick={(roomId, date, startTime, durationMinutes) => setBookingSlot({ roomId, date, startTime, durationMinutes })}
              onAllocationClick={setActionAllocation}
            />
          )}
        </main>

        {sidePanel === "swaps" && (
          <aside className="fixed inset-0 z-50 bg-white overflow-auto md:relative md:inset-auto md:z-auto md:w-80 md:border-l md:shrink-0">
            <SwapRequestsPanel
              swapRequests={swapRequests}
              currentUserId={currentUser.id}
              onClose={() => setSidePanel(null)}
              onUpdate={() => { fetchSwapRequests(); fetchAllocations(); }}
            />
          </aside>
        )}

        {sidePanel === "admin" && currentUser.is_admin && (
          <aside className="fixed inset-0 z-50 bg-white overflow-auto md:relative md:inset-auto md:z-auto md:w-80 md:border-l md:shrink-0">
            <AdminPanel
              currentUser={currentUser}
              onClose={() => setSidePanel(null)}
              onSelfDemoted={() => { setSidePanel(null); window.location.reload(); }}
              onLocationsChanged={() => router.refresh()}
            />
          </aside>
        )}
      </div>

      {bookingSlot && (
        <BookingDialog
          slot={bookingSlot}
          rooms={rooms}
          currentUser={currentUser}
          allProfiles={allProfiles}
          locations={locations}
          onClose={() => setBookingSlot(null)}
          onSaved={() => { setBookingSlot(null); fetchAllocations(); }}
        />
      )}

      {actionAllocation && (
        <AllocationActionDialog
          allocation={actionAllocation}
          rooms={rooms}
          currentUserId={currentUser.id}
          allAllocations={allocations}
          onClose={() => setActionAllocation(null)}
          onUpdate={() => { setActionAllocation(null); fetchAllocations(); }}
          onSwapRequest={() => { setActionAllocation(null); fetchSwapRequests(); }}
        />
      )}
    </div>
  );
}
