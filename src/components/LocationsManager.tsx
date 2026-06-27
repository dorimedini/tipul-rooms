"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Location, RoomWithHours } from "@/lib/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { DAY_NAMES, START_TIMES } from "@/lib/allocations";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type HourRow = { open: boolean; openTime: string; closeTime: string };
const DEFAULT_HOURS: HourRow[] = DAY_NAMES.map(() => ({
  open: false, openTime: "08:00", closeTime: "20:00",
}));

export function LocationsManager({ open, onClose, onChanged }: Props) {
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [roomsByLocation, setRoomsByLocation] = useState<Record<string, RoomWithHours[]>>({});
  const [error, setError] = useState<string | null>(null);

  // Add location form
  const [newLocName, setNewLocName] = useState("");

  // Room form state (null = closed)
  const [addingRoomForLocation, setAddingRoomForLocation] = useState<string | null>(null);
  const [editingRoomHours, setEditingRoomHours] = useState<RoomWithHours | null>(null);
  const [roomName, setRoomName] = useState("");
  const [hours, setHours] = useState<HourRow[]>(DEFAULT_HOURS);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data: locs }, { data: rooms }] = await Promise.all([
      supabase.from("locations").select("*").order("name"),
      supabase.from("rooms").select("*, room_hours(*)").order("name"),
    ]);
    setLocations(locs ?? []);
    const byLoc: Record<string, RoomWithHours[]> = {};
    for (const r of (rooms ?? []) as unknown as RoomWithHours[]) {
      (byLoc[r.location_id] ??= []).push(r);
    }
    setRoomsByLocation(byLoc);
  }, []);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  function notify(msg: string) { setError(msg); setTimeout(() => setError(null), 5000); }

  async function addLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!newLocName.trim()) return;
    const res = await fetch("/api/admin/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newLocName.trim() }),
    });
    if (res.ok) { setNewLocName(""); await refresh(); onChanged(); }
    else { const d = await res.json(); notify(d.error); }
  }

  async function deleteLocation(loc: Location) {
    const roomCount = roomsByLocation[loc.id]?.length ?? 0;
    const msg = roomCount > 0
      ? `Delete location "${loc.name}"? This will also delete ${roomCount} room(s) and all their bookings.`
      : `Delete location "${loc.name}"?`;
    if (!window.confirm(msg)) return;
    const res = await fetch(`/api/admin/locations/${loc.id}`, { method: "DELETE" });
    if (res.ok) { await refresh(); onChanged(); }
    else { const d = await res.json(); notify(d.error); }
  }

  async function deleteRoom(room: RoomWithHours) {
    if (!window.confirm(`Delete room "${room.name}"? This will also delete all bookings in this room.`)) return;
    const res = await fetch(`/api/admin/rooms/${room.id}`, { method: "DELETE" });
    if (res.ok) { await refresh(); onChanged(); }
    else { const d = await res.json(); notify(d.error); }
  }

  function openAddRoom(locationId: string) {
    setAddingRoomForLocation(locationId);
    setEditingRoomHours(null);
    setRoomName("");
    setHours(DEFAULT_HOURS.map(h => ({ ...h })));
  }

  function openEditHours(room: RoomWithHours) {
    setEditingRoomHours(room);
    setAddingRoomForLocation(null);
    const h: HourRow[] = DAY_NAMES.map((_, i) => {
      const existing = room.room_hours.find(rh => rh.day_of_week === i);
      return existing
        ? { open: true, openTime: existing.open_time.slice(0, 5), closeTime: existing.close_time.slice(0, 5) }
        : { open: false, openTime: "08:00", closeTime: "20:00" };
    });
    setHours(h);
  }

  function closeRoomForm() {
    setAddingRoomForLocation(null);
    setEditingRoomHours(null);
  }

  function setHourField(dayIndex: number, field: keyof HourRow, value: string | boolean) {
    setHours(prev => prev.map((h, i) => i === dayIndex ? { ...h, [field]: value } : h));
  }

  function hoursPayload() {
    return hours
      .map((h, i) => h.open ? { dayOfWeek: i, openTime: h.openTime, closeTime: h.closeTime } : null)
      .filter(Boolean);
  }

  async function saveRoom(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = hoursPayload();
    let res: Response;
    if (editingRoomHours) {
      res = await fetch(`/api/admin/rooms/${editingRoomHours.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours: payload }),
      });
    } else {
      res = await fetch("/api/admin/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: addingRoomForLocation, name: roomName.trim(), hours: payload }),
      });
    }
    setSaving(false);
    if (res.ok) { closeRoomForm(); await refresh(); onChanged(); }
    else { const d = await res.json(); notify(d.error); }
  }

  const showRoomForm = addingRoomForLocation !== null || editingRoomHours !== null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Locations &amp; Rooms</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 pr-1">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

          {/* Locations list */}
          {locations.map(loc => (
            <div key={loc.id} className="border rounded-lg">
              <div className="flex items-center justify-between px-4 py-2 bg-muted rounded-t-lg">
                <span className="font-medium text-sm">{loc.name}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openAddRoom(loc.id)}>
                    + Add room
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-600"
                    onClick={() => deleteLocation(loc)}
                  >
                    Delete location
                  </Button>
                </div>
              </div>

              <div className="divide-y">
                {(roomsByLocation[loc.id] ?? []).length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-400 italic">No rooms yet</div>
                )}
                {(roomsByLocation[loc.id] ?? []).map(room => (
                  <div key={room.id} className="flex items-center justify-between px-4 py-2">
                    <div>
                      <div className="text-sm font-medium">{room.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {room.room_hours.length === 0
                          ? "No hours set"
                          : room.room_hours
                              .sort((a, b) => a.day_of_week - b.day_of_week)
                              .map(h => `${DAY_NAMES[h.day_of_week].slice(0, 3)} ${h.open_time.slice(0, 5)}–${h.close_time.slice(0, 5)}`)
                              .join(", ")
                        }
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditHours(room)}>
                        Edit hours
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-600"
                        onClick={() => deleteRoom(room)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Add location — hidden while room form is open */}
          {!showRoomForm && (
            <form onSubmit={addLocation} className="flex gap-2 pt-2">
              <input
                type="text"
                value={newLocName}
                onChange={e => setNewLocName(e.target.value)}
                placeholder="New location name…"
                className="flex-1 border rounded-md px-3 py-2 text-sm"
                required
              />
              <Button type="submit" size="sm">Add location</Button>
            </form>
          )}

          {/* Room form (add or edit hours) */}
          {showRoomForm && (
            <div className="border rounded-lg p-4 bg-secondary space-y-4">
              <div className="font-medium text-sm">
                {editingRoomHours ? `Edit hours: ${editingRoomHours.name}` : "New room"}
              </div>

              <form onSubmit={saveRoom} className="space-y-4">
                {!editingRoomHours && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={roomName}
                      onChange={e => setRoomName(e.target.value)}
                      placeholder="Room name…"
                      className="flex-1 border rounded-md px-3 py-2 text-sm bg-white"
                      required
                    />
                  </div>
                )}

                {/* Hours grid */}
                <div className="space-y-2">
                  <div className="grid grid-cols-[80px_40px_1fr_1fr] gap-x-3 gap-y-1 text-xs font-semibold text-gray-500 uppercase px-1">
                    <span>Day</span><span>Open</span><span>Opens</span><span>Closes</span>
                  </div>
                  {DAY_NAMES.map((day, i) => (
                    <div key={i} className="grid grid-cols-[80px_40px_1fr_1fr] gap-x-3 items-center">
                      <span className="text-sm">{day}</span>
                      <input
                        type="checkbox"
                        checked={hours[i].open}
                        onChange={e => setHourField(i, "open", e.target.checked)}
                        className="w-4 h-4"
                      />
                      <select
                        value={hours[i].openTime}
                        onChange={e => setHourField(i, "openTime", e.target.value)}
                        disabled={!hours[i].open}
                        className="border rounded px-2 py-1 text-sm bg-white disabled:opacity-40"
                      >
                        {START_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select
                        value={hours[i].closeTime}
                        onChange={e => setHourField(i, "closeTime", e.target.value)}
                        disabled={!hours[i].open}
                        className="border rounded px-2 py-1 text-sm bg-white disabled:opacity-40"
                      >
                        {START_TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={closeRoomForm}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? "Saving…" : editingRoomHours ? "Save hours" : "Add room"}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
