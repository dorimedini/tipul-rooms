"use client";

import { useState } from "react";
import { format, addMonths } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Alert, AlertDescription } from "./ui/alert";
import { Location, Profile, Room } from "@/lib/supabase/types";
import { START_TIMES, DURATION_OPTIONS, minutesToTimeLabel } from "@/lib/allocations";

type RoomWithLocation = Room & { locations: Location };

interface Props {
  slot: { roomId: string; date: Date; startTime: string };
  rooms: RoomWithLocation[];
  currentUser: Profile;
  allProfiles: Profile[];
  locations: Location[];
  onClose: () => void;
  onSaved: () => void;
}

export function BookingDialog({ slot, rooms, currentUser, locations, onClose, onSaved }: Props) {
  const [roomId, setRoomId] = useState(slot.roomId);
  const [startTime, setStartTime] = useState(slot.startTime);
  const [duration, setDuration] = useState(60);
  const [recurring, setRecurring] = useState(false);
  const [seriesEnd, setSeriesEnd] = useState(format(addMonths(slot.date, 10), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setConflicts([]);
    try {
      const res = await fetch("/api/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          date: format(slot.date, "yyyy-MM-dd"),
          startTime,
          durationMinutes: duration,
          recurring,
          seriesEnd,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.conflicts) setConflicts(data.conflicts);
        else setError(data.error ?? "Failed to save");
      } else {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  const room = rooms.find(r => r.id === roomId);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book a room</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="text-sm text-gray-600 font-medium">
            {format(slot.date, "EEEE, MMMM d, yyyy")}
          </div>

          <div className="grid gap-2">
            <Label>Location & Room</Label>
            <Select value={roomId} onValueChange={v => v && setRoomId(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locations.map(loc => (
                  <div key={loc.id}>
                    <div className="px-2 py-1 text-xs text-gray-400 font-semibold uppercase">{loc.name}</div>
                    {rooms.filter(r => r.location_id === loc.id).map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Start time</Label>
              <Select value={startTime} onValueChange={v => v && setStartTime(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {START_TIMES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Duration</Label>
              <Select value={String(duration)} onValueChange={v => setDuration(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map(d => (
                    <SelectItem key={d} value={String(d)}>{minutesToTimeLabel(d)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="recurring"
              checked={recurring}
              onChange={e => setRecurring(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="recurring" className="cursor-pointer">
              Repeat weekly
            </Label>
          </div>

          {recurring && (
            <div className="grid gap-2">
              <Label>Repeat until</Label>
              <input
                type="date"
                value={seriesEnd}
                min={format(slot.date, "yyyy-MM-dd")}
                onChange={e => setSeriesEnd(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm"
              />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {conflicts.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <div className="font-medium mb-1">Conflicts on {conflicts.length} date(s):</div>
                <div className="text-xs">{conflicts.join(", ")}</div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : recurring ? "Book recurring" : "Book"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
