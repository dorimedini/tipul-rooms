"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Location, Room, Profile, AllocationWithDetails, SwapRequestWithDetails } from "@/lib/supabase/types";
import { WeeklyCalendar } from "./WeeklyCalendar";
import { BookingDialog } from "./BookingDialog";
import { AllocationActionDialog } from "./AllocationActionDialog";
import { SwapRequestsPanel } from "./SwapRequestsPanel";
import { AdminPanel } from "./AdminPanel";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { addWeeks, subWeeks, startOfWeek, endOfWeek, format } from "date-fns";

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
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [selectedLocationId, setSelectedLocationId] = useState<string>(locations[0]?.id ?? "");
  const [allocations, setAllocations] = useState<AllocationWithDetails[]>([]);
  const [swapRequests, setSwapRequests] = useState<SwapRequestWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);

  const [bookingSlot, setBookingSlot] = useState<{ roomId: string; date: Date; startTime: string } | null>(null);
  const [actionAllocation, setActionAllocation] = useState<AllocationWithDetails | null>(null);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });

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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-gray-900">Tipul Rooms</h1>
          <nav className="flex gap-1">
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
        <div className="flex items-center gap-3">
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
          <span className="text-sm text-gray-500">{currentUser.name}</span>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto p-4">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="outline" size="sm" onClick={() => setWeekStart(d => subWeeks(d, 1))}>←</Button>
            <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
              {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
            </span>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(d => addWeeks(d, 1))}>→</Button>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}>
              Today
            </Button>
          </div>

          {locationRooms.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              {locations.length === 0 ? "No locations configured yet." : "No rooms in this location."}
            </div>
          ) : (
            <WeeklyCalendar
              weekStart={weekStart}
              rooms={locationRooms}
              allocations={allocations}
              currentUserId={currentUser.id}
              loading={loading}
              onSlotClick={(roomId, date, startTime) => setBookingSlot({ roomId, date, startTime })}
              onAllocationClick={setActionAllocation}
            />
          )}
        </main>

        {sidePanel === "swaps" && (
          <aside className="w-80 border-l bg-white overflow-auto shrink-0">
            <SwapRequestsPanel
              swapRequests={swapRequests}
              currentUserId={currentUser.id}
              onClose={() => setSidePanel(null)}
              onUpdate={() => { fetchSwapRequests(); fetchAllocations(); }}
            />
          </aside>
        )}

        {sidePanel === "admin" && currentUser.is_admin && (
          <aside className="w-80 border-l bg-white overflow-auto shrink-0">
            <AdminPanel
              currentUser={currentUser}
              onClose={() => setSidePanel(null)}
              onSelfDemoted={() => {
                setSidePanel(null);
                window.location.reload();
              }}
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
