"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  const [selectedRoomId, setSelectedRoomId] = useState<string>(
    () => rooms.find(r => r.location_id === locations[0]?.id)?.id ?? ""
  );
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
  const selectedRoom = locationRooms.find(r => r.id === selectedRoomId) ?? locationRooms[0] ?? null;

  // When location changes, select its first room
  useEffect(() => {
    setSelectedRoomId(locationRooms[0]?.id ?? "");
  }, [selectedLocationId]); // eslint-disable-line react-hooks/exhaustive-deps

  function togglePanel(panel: SidePanel) {
    setSidePanel(prev => prev === panel ? null : panel);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  // Use functional updates so these are safe to call from effects without stale closures
  function prevDay() {
    setMobileDayIndex(i => {
      if (i > 0) return i - 1;
      setWeekStart(d => subWeeks(d, 1));
      return 6;
    });
  }

  function nextDay() {
    setMobileDayIndex(i => {
      if (i < 6) return i + 1;
      setWeekStart(d => addWeeks(d, 1));
      return 0;
    });
  }

  function goToToday() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
    setMobileDayIndex(new Date().getDay());
  }

  // Swipe left/right to navigate
  const mainRef = useRef<HTMLElement>(null);
  const calendarViewRef = useRef(calendarView);
  calendarViewRef.current = calendarView;
  const prevDayRef = useRef(prevDay);
  prevDayRef.current = prevDay;
  const nextDayRef = useRef(nextDay);
  nextDayRef.current = nextDay;

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    let startX = 0, startY = 0;
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }
    function onTouchEnd(e: TouchEvent) {
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const adx = Math.abs(dx);
      const ady = Math.abs(t.clientY - startY);
      if (adx < 40 || adx < ady * 1.5) return; // not a clear horizontal swipe
      if (calendarViewRef.current === "day") {
        dx < 0 ? nextDayRef.current() : prevDayRef.current();
      } else {
        dx < 0
          ? setWeekStart(d => addWeeks(d, 1))
          : setWeekStart(d => subWeeks(d, 1));
      }
    }
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-[#003049] px-4">
        <div className="flex items-center justify-between py-2 md:py-3">
          <div className="flex items-center gap-2 md:gap-4">
            <h1 className="text-lg font-semibold text-white">Tipul Rooms</h1>
            {/* Desktop: location tabs inline with title */}
            <nav className="hidden md:flex gap-1">
              {locations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocationId(loc.id)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    selectedLocationId === loc.id
                      ? "bg-[#669bbc]/30 text-white font-medium"
                      : "text-white/70 hover:bg-white/10"
                  }`}
                >
                  {loc.name}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => togglePanel("swaps")}
              className={sidePanel === "swaps"
                ? "text-white bg-white/20 hover:bg-white/25"
                : "text-white/80 hover:text-white hover:bg-white/10"}
            >
              Swaps
              {pendingSwapsCount > 0 && (
                <Badge className="ml-1.5 bg-[#c1121f] text-white text-xs px-1.5 py-0">
                  {pendingSwapsCount}
                </Badge>
              )}
            </Button>
            {currentUser.is_admin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => togglePanel("admin")}
                className={sidePanel === "admin"
                  ? "text-white bg-white/20 hover:bg-white/25"
                  : "text-white/80 hover:text-white hover:bg-white/10"}
              >
                Admin
              </Button>
            )}
            <span className="hidden md:inline text-sm text-white/60">{currentUser.name}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}
              className="text-white/70 hover:text-white hover:bg-white/10">Sign out</Button>
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
                    ? "bg-[#669bbc]/30 text-white font-medium"
                    : "text-white/70 hover:bg-white/10"
                }`}
              >
                {loc.name}
              </button>
            ))}
          </nav>
        )}
        {/* Room tabs */}
        {locationRooms.length > 0 && (
          <nav className="flex gap-1 overflow-x-auto pb-2 border-t border-white/10 pt-2">
            {locationRooms.map(room => (
              <button
                key={room.id}
                onClick={() => setSelectedRoomId(room.id)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
                  room.id === (selectedRoom?.id)
                    ? "bg-[#c1121f] text-white font-medium"
                    : "text-white/70 hover:bg-white/10"
                }`}
              >
                {room.name}
              </button>
            ))}
          </nav>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main ref={mainRef} className="flex-1 overflow-auto p-4">
          {/* Navigation bar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {/* Day/Week toggle */}
            <div className="flex rounded-md border border-border overflow-hidden text-sm shrink-0">
              <button
                className={`px-3 py-1 ${calendarView === "day" ? "bg-[#003049] text-white font-medium" : "text-foreground/60"}`}
                onClick={() => setCalendarView("day")}
              >Day</button>
              <button
                className={`px-3 py-1 border-l border-border ${calendarView === "week" ? "bg-[#003049] text-white font-medium" : "text-foreground/60"}`}
                onClick={() => setCalendarView("week")}
              >Week</button>
            </div>

            {/* Day view navigation */}
            {calendarView === "day" && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={prevDay}>←</Button>
                <span className="text-sm font-medium text-foreground min-w-[130px] text-center">
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
                <span className="text-sm font-medium text-foreground min-w-[160px] text-center">
                  {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
                </span>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(d => addWeeks(d, 1))}>→</Button>
                <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}>Today</Button>
              </div>
            )}
          </div>

          {!selectedRoom ? (
            <div className="text-center py-20 text-muted-foreground">
              {locations.length === 0 ? "No locations configured yet." : "No rooms in this location."}
            </div>
          ) : (
            <WeeklyCalendar
              days={displayDays}
              rooms={[selectedRoom]}
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
          <aside className="fixed inset-0 z-50 bg-background overflow-auto md:relative md:inset-auto md:z-auto md:w-80 md:border-l md:shrink-0">
            <SwapRequestsPanel
              swapRequests={swapRequests}
              currentUserId={currentUser.id}
              onClose={() => setSidePanel(null)}
              onUpdate={() => { fetchSwapRequests(); fetchAllocations(); }}
            />
          </aside>
        )}

        {sidePanel === "admin" && currentUser.is_admin && (
          <aside className="fixed inset-0 z-50 bg-background overflow-auto md:relative md:inset-auto md:z-auto md:w-80 md:border-l md:shrink-0">
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
