"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { HolidayBlock } from "@/lib/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Alert, AlertDescription } from "./ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";
import { START_TIMES } from "@/lib/allocations";

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function HolidayBlocksManager({ open, onClose, onChanged }: Props) {
  const supabase = createClient();
  const [blocks, setBlocks] = useState<HolidayBlock[]>([]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("22:00");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    // Past blocks are history; the list is for what's still to come.
    const { data } = await supabase
      .from("holiday_blocks")
      .select("*")
      .gte("date", format(new Date(), "yyyy-MM-dd"))
      .order("date")
      .order("start_time");
    setBlocks(data ?? []);
  }, []);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  async function addBlock(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const res = await fetch("/api/admin/holiday-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, startTime, endTime, title: title.trim() }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) { setError(data.error ?? "Failed to add block"); return; }

    setTitle("");
    setMessage(
      data.cancelled > 0
        ? `Block added. ${data.cancelled} existing booking(s) in that range were cancelled.`
        : "Block added."
    );
    await refresh();
    onChanged();
  }

  async function removeBlock(block: HolidayBlock) {
    if (!window.confirm(
      `Remove the block "${block.title}" on ${format(parseISO(block.date), "EEE MMM d")}? ` +
      `Bookings it cancelled are not restored.`
    )) return;

    const res = await fetch(`/api/admin/holiday-blocks/${block.id}`, { method: "DELETE" });
    if (res.ok) { setMessage(null); await refresh(); onChanged(); }
    else { const d = await res.json(); setError(d.error ?? "Failed to remove block"); }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Holiday blocks</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4 pr-1">
          <p className="text-xs text-gray-500">
            A block closes every room in every location for its time range. Bookings it covers are
            cancelled, and new recurring bookings skip the dates it falls on.
          </p>

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}

          <form onSubmit={addBlock} className="grid gap-3 border rounded-lg p-3 bg-secondary">
            <div className="grid gap-2">
              <Label>Title</Label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. ערב חג, Clinic closed…"
                className="border rounded-md px-3 py-2 text-sm bg-white"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label>Date</Label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm bg-white"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>From</Label>
                <Select value={startTime} onValueChange={v => v && setStartTime(v)}>
                  <SelectTrigger><span className="flex flex-1 text-left">{startTime}</span></SelectTrigger>
                  <SelectContent>
                    {START_TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Until</Label>
                <Select value={endTime} onValueChange={v => v && setEndTime(v)}>
                  <SelectTrigger><span className="flex flex-1 text-left">{endTime}</span></SelectTrigger>
                  <SelectContent>
                    {START_TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" size="sm" disabled={saving} className="justify-self-end">
              {saving ? "Adding…" : "Add block"}
            </Button>
          </form>

          <div className="border rounded-lg divide-y">
            {blocks.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-400 italic">No upcoming blocks</div>
            )}
            {blocks.map(block => (
              <div key={block.id} className="flex items-center justify-between px-4 py-2">
                <div>
                  <div className="text-sm font-medium">{block.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {format(parseISO(block.date), "EEE MMM d, yyyy")} ·{" "}
                    {block.start_time.slice(0, 5)}–{block.end_time.slice(0, 5)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-600"
                  onClick={() => removeBlock(block)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
