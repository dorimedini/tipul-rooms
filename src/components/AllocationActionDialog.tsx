"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { AllocationWithDetails, Location, Room } from "@/lib/supabase/types";
import { START_TIMES, DURATION_OPTIONS, minutesToTimeLabel } from "@/lib/allocations";

type RoomWithLocation = Room & { locations: Location };

interface Props {
  allocation: AllocationWithDetails;
  rooms: RoomWithLocation[];
  currentUserId: string;
  allAllocations: AllocationWithDetails[];
  onClose: () => void;
  onUpdate: () => void;
  onSwapRequest: () => void;
}

type View = "menu" | "cancel_confirm" | "move";

export function AllocationActionDialog({
  allocation,
  rooms,
  currentUserId,
  allAllocations,
  onClose,
  onUpdate,
  onSwapRequest,
}: Props) {
  const [view, setView] = useState<View>("menu");
  const [scope, setScope] = useState<"single" | "from_here">("single");
  const [newRoomId, setNewRoomId] = useState(allocation.room_id);
  const [newStartTime, setNewStartTime] = useState(allocation.start_time);
  const [newDuration, setNewDuration] = useState(allocation.duration_minutes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moveResult, setMoveResult] = useState<{ moved: number; collisions: string[] } | null>(null);

  // Swap request
  const [swapTargetId, setSwapTargetId] = useState<string>("");
  const [swapSaving, setSwapSaving] = useState(false);

  const isOwn = allocation.user_id === currentUserId;
  const hasSeries = !!allocation.series_id;

  // Other users' active allocations this week for swap
  const swappableAllocations = allAllocations.filter(
    a => a.user_id !== currentUserId && a.status === "active"
  );

  async function handleCancel() {
    setSaving(true);
    setError(null);
    const action = scope === "single" ? "cancel_single" : "cancel_from_here";
    const res = await fetch(`/api/allocations/${allocation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setSaving(false);
    if (res.ok) onUpdate();
    else {
      const d = await res.json();
      setError(d.error ?? "Failed");
    }
  }

  async function handleMove() {
    setSaving(true);
    setError(null);
    setMoveResult(null);
    const res = await fetch(`/api/allocations/${allocation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "move_from_here",
        newRoomId,
        newStartTime,
        newDurationMinutes: newDuration,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setMoveResult({ moved: data.moved, collisions: data.collisions });
      if (data.collisions.length === 0) onUpdate();
    } else {
      setError(data.error ?? "Failed");
    }
  }

  async function handleSwapRequest() {
    if (!swapTargetId) return;
    setSwapSaving(true);
    const res = await fetch("/api/swap-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requesterAllocationId: allocation.id,
        targetAllocationId: swapTargetId,
      }),
    });
    setSwapSaving(false);
    if (res.ok) { onSwapRequest(); onClose(); }
    else {
      const d = await res.json();
      setError(d.error ?? "Failed");
    }
  }

  const room = (allocation as any).rooms as RoomWithLocation;
  const location = room?.locations;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {format(allocation.date, "EEEE, MMM d")} · {allocation.start_time.slice(0, 5)}
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-gray-600 space-y-1 pb-2 border-b">
          <div><span className="font-medium">{allocation.profiles?.name}</span></div>
          <div>{location?.name} · {room?.name}</div>
          <div>{minutesToTimeLabel(allocation.duration_minutes)}</div>
          {hasSeries && <Badge variant="secondary" className="text-xs">Recurring</Badge>}
        </div>

        {view === "menu" && (
          <div className="flex flex-col gap-2">
            {isOwn ? (
              <>
                <Button variant="outline" onClick={() => setView("cancel_confirm")}>
                  Cancel booking
                </Button>
                {hasSeries && (
                  <Button variant="outline" onClick={() => setView("move")}>
                    Move subsequent sessions
                  </Button>
                )}
                {swappableAllocations.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <Label className="text-sm mb-2 block">Request swap with</Label>
                    <Select value={swapTargetId} onValueChange={v => v && setSwapTargetId(v)}>
                      <SelectTrigger>
                        <span className="flex flex-1 text-left text-sm">
                          {swapTargetId
                            ? (() => { const a = swappableAllocations.find(a => a.id === swapTargetId); return a ? `${a.profiles?.name} · ${format(a.date, "MMM d")} ${a.start_time.slice(0, 5)}` : ""; })()
                            : <span className="text-muted-foreground">Select a session to swap with…</span>}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {swappableAllocations.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.profiles?.name} · {format(a.date, "MMM d")} {a.start_time.slice(0, 5)} · {(a as any).rooms?.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {swapTargetId && (
                      <Button
                        size="sm"
                        className="mt-2 w-full"
                        disabled={swapSaving}
                        onClick={handleSwapRequest}
                      >
                        {swapSaving ? "Sending…" : "Send swap request"}
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-sm text-gray-500">This slot belongs to {allocation.profiles?.name}.</div>
                {swappableAllocations.some(a => a.user_id === currentUserId) && (
                  <div className="mt-2">
                    <Label className="text-sm mb-2 block">Offer one of your slots in exchange</Label>
                    <Select value={swapTargetId} onValueChange={v => v && setSwapTargetId(v)}>
                      <SelectTrigger>
                        <span className="flex flex-1 text-left text-sm">
                          {swapTargetId
                            ? (() => { const a = allAllocations.find(a => a.id === swapTargetId); return a ? `${format(a.date, "MMM d")} ${a.start_time.slice(0, 5)} · ${(a as any).rooms?.name}` : ""; })()
                            : <span className="text-muted-foreground">Your session to offer…</span>}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {allAllocations.filter(a => a.user_id === currentUserId).map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {format(a.date, "MMM d")} {a.start_time.slice(0, 5)} · {(a as any).rooms?.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {swapTargetId && (
                      <Button
                        size="sm"
                        className="mt-2 w-full"
                        disabled={swapSaving}
                        onClick={async () => {
                          setSwapSaving(true);
                          const res = await fetch("/api/swap-requests", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              requesterAllocationId: swapTargetId,
                              targetAllocationId: allocation.id,
                            }),
                          });
                          setSwapSaving(false);
                          if (res.ok) { onSwapRequest(); onClose(); }
                        }}
                      >
                        {swapSaving ? "Sending…" : "Send swap request"}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          </div>
        )}

        {view === "cancel_confirm" && (
          <div className="flex flex-col gap-4">
            {hasSeries && (
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={scope === "single"} onChange={() => setScope("single")} />
                  <span className="text-sm">Cancel only this session ({format(allocation.date, "MMM d")})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={scope === "from_here"} onChange={() => setScope("from_here")} />
                  <span className="text-sm">Cancel this and all future sessions in this series</span>
                </label>
              </div>
            )}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setView("menu")}>Back</Button>
              <Button variant="destructive" disabled={saving} onClick={handleCancel}>
                {saving ? "Cancelling…" : "Confirm cancel"}
              </Button>
            </div>
          </div>
        )}

        {view === "move" && (
          <div className="flex flex-col gap-4">
            <div className="text-sm text-gray-600">
              Move this and all future sessions in the series to a new time/room.
            </div>
            <div className="grid gap-2">
              <Label>New room</Label>
              <Select value={newRoomId} onValueChange={v => v && setNewRoomId(v)}>
                <SelectTrigger>
                  <span className="flex flex-1 text-left">
                    {(() => { const r = rooms.find(r => r.id === newRoomId); return r ? `${r.locations?.name} · ${r.name}` : "Select room…"; })()}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {rooms.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.locations?.name} · {r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>New start time</Label>
                <Select value={newStartTime} onValueChange={v => v && setNewStartTime(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {START_TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Duration</Label>
                <Select value={String(newDuration)} onValueChange={v => v && setNewDuration(Number(v))}>
                  <SelectTrigger>
                    <span className="flex flex-1 text-left">{minutesToTimeLabel(newDuration)}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map(d => <SelectItem key={d} value={String(d)}>{minutesToTimeLabel(d)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {moveResult && (
              <Alert variant={moveResult.collisions.length > 0 ? "destructive" : "default"}>
                <AlertDescription>
                  <div>Moved {moveResult.moved} session(s).</div>
                  {moveResult.collisions.length > 0 && (
                    <div className="mt-1 text-xs">
                      Skipped {moveResult.collisions.length} collision(s): {moveResult.collisions.join(", ")}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setView("menu")}>Back</Button>
              <Button disabled={saving} onClick={handleMove}>
                {saving ? "Moving…" : "Move sessions"}
              </Button>
              {moveResult && <Button onClick={onUpdate}>Done</Button>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
