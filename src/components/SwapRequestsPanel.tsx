"use client";

import { useState } from "react";
import { format } from "date-fns";
import { SwapRequestWithDetails } from "@/lib/supabase/types";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { minutesToTimeLabel } from "@/lib/allocations";

interface Props {
  swapRequests: SwapRequestWithDetails[];
  currentUserId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function SwapRequestsPanel({ swapRequests, currentUserId, onClose, onUpdate }: Props) {
  const [respondingId, setRespondingId] = useState<string | null>(null);

  async function respond(id: string, action: "accept" | "decline" | "cancel") {
    setRespondingId(id);
    await fetch(`/api/swap-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setRespondingId(null);
    onUpdate();
  }

  const mine = swapRequests.filter(s => s.requester_id === currentUserId);
  const incoming = swapRequests.filter(
    s => (s.target_allocation as any)?.user_id === currentUserId
  );

  function AllocationChip({ alloc }: { alloc: any }) {
    return (
      <div className="text-xs bg-gray-100 rounded px-2 py-1">
        <div className="font-medium">{alloc?.rooms?.name}</div>
        <div className="text-gray-500">
          {alloc?.date ? format(alloc.date, "MMM d") : "?"} · {alloc?.start_time?.slice(0, 5)} · {minutesToTimeLabel(alloc?.duration_minutes)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-sm">Swap Requests</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {incoming.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Incoming</h3>
            <div className="space-y-3">
              {incoming.map(s => (
                <div key={s.id} className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-medium">{(s as any).requester?.name} wants to swap</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Their slot</div>
                      <AllocationChip alloc={s.requester_allocation} />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Your slot</div>
                      <AllocationChip alloc={s.target_allocation} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1" disabled={respondingId === s.id} onClick={() => respond(s.id, "accept")}>
                      {respondingId === s.id ? "…" : "Accept"}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" disabled={respondingId === s.id} onClick={() => respond(s.id, "decline")}>
                      {respondingId === s.id ? "…" : "Decline"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {mine.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Sent by you</h3>
            <div className="space-y-3">
              {mine.map(s => (
                <div key={s.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      Swap with {(s.target_allocation as any)?.profiles?.name}
                    </div>
                    <Badge variant="secondary" className="text-xs">{s.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Your slot</div>
                      <AllocationChip alloc={s.requester_allocation} />
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Their slot</div>
                      <AllocationChip alloc={s.target_allocation} />
                    </div>
                  </div>
                  {s.status === "pending" && (
                    <Button size="sm" variant="outline" className="w-full" disabled={respondingId === s.id} onClick={() => respond(s.id, "cancel")}>
                      {respondingId === s.id ? "Cancelling…" : "Cancel request"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {mine.length === 0 && incoming.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No pending swap requests.
          </div>
        )}
      </div>
    </div>
  );
}
