"use client";

import { useRef, useEffect, useState } from "react";
import { format, isSameDay } from "date-fns";
import { AllocationWithDetails } from "@/lib/supabase/types";
import { timeToMinutes, minutesToTime } from "@/lib/allocations";

interface Room { id: string; name: string; location_id: string }

type DragState = {
  roomId: string;
  day: Date;
  startMin: number;
  endMin: number;
  cellTop: number;
};

interface Props {
  days: Date[];
  rooms: Room[];
  allocations: AllocationWithDetails[];
  currentUserId: string;
  loading: boolean;
  fitScreen?: boolean;
  onSlotClick: (roomId: string, date: Date, startTime: string, durationMinutes?: number) => void;
  onAllocationClick: (allocation: AllocationWithDetails) => void;
}

const DEFAULT_SLOT_HEIGHT = 16; // px per 15 minutes
const MIN_SLOT_HEIGHT = 6;
const MAX_SLOT_HEIGHT = 40;
const DAY_START = 7 * 60;
const DAY_END = 22 * 60;
const TOTAL_MINUTES = DAY_END - DAY_START;
const DRAG_THRESHOLD = DEFAULT_SLOT_HEIGHT;

const COLORS = [
  "bg-blue-100 border-blue-400 text-blue-900",
  "bg-green-100 border-green-400 text-green-900",
  "bg-purple-100 border-purple-400 text-purple-900",
  "bg-orange-100 border-orange-400 text-orange-900",
  "bg-pink-100 border-pink-400 text-pink-900",
  "bg-teal-100 border-teal-400 text-teal-900",
  "bg-yellow-100 border-yellow-400 text-yellow-900",
  "bg-red-100 border-red-400 text-red-900",
];

function userColor(userId: string, allUserIds: string[]): string {
  const idx = allUserIds.indexOf(userId);
  return COLORS[idx % COLORS.length] ?? COLORS[0];
}

function shortHour(label: string): string {
  return String(parseInt(label.split(":")[0], 10));
}

function pinchDist(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function WeeklyCalendar({
  days, rooms, allocations, currentUserId, loading,
  fitScreen = false, onSlotClick, onAllocationClick,
}: Props) {
  const allUserIds = [...new Set(allocations.map(a => a.user_id))];

  const timeLabels: string[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) {
    timeLabels.push(minutesToTime(m));
  }

  // ── Zoom (pinch on mobile) ───────────────────────────────────────────────
  const [slotHeight, setSlotHeight] = useState(DEFAULT_SLOT_HEIGHT);
  const slotHeightRef = useRef(slotHeight);
  slotHeightRef.current = slotHeight;
  const totalHeight = (TOTAL_MINUTES / 15) * slotHeight;

  const calendarBodyRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ dist: number; baseHeight: number } | null>(null);

  // ── Drag-to-create ───────────────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const onSlotClickRef = useRef(onSlotClick);
  onSlotClickRef.current = onSlotClick;
  const didDrag = useRef(false);
  const pointerDownY = useRef(0);
  const pointerDownX = useRef(0);

  // Cursor / text-selection during drag
  useEffect(() => {
    document.body.style.userSelect = drag ? "none" : "";
    document.body.style.cursor = drag ? "ns-resize" : "";
  }, [drag != null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Non-passive touchstart on the body container to detect pinch start
  useEffect(() => {
    const el = calendarBodyRef.current;
    if (!el) return;
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        setDrag(null);
        didDrag.current = false;
        pinchRef.current = { dist: pinchDist(e.touches), baseHeight: slotHeightRef.current };
      }
    }
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => el.removeEventListener("touchstart", onTouchStart);
  }, []);

  // Global mouse + touch handlers (all refs → runs once)
  useEffect(() => {
    function yToMin(clientY: number): number {
      const d = dragRef.current;
      if (!d) return DAY_START;
      const sh = slotHeightRef.current;
      const totalH = (TOTAL_MINUTES / 15) * sh;
      const rawY = clientY - d.cellTop;
      const clampedY = Math.max(0, Math.min(totalH, rawY));
      return Math.min(DAY_END, DAY_START + Math.round(clampedY / sh) * 15);
    }

    function finish(clientY: number) {
      const d = dragRef.current;
      if (!d) return;
      if (didDrag.current) {
        const endMin = yToMin(clientY);
        const start = Math.min(d.startMin, endMin);
        const end = Math.max(d.startMin, endMin);
        onSlotClickRef.current(d.roomId, d.day, minutesToTime(start), Math.max(15, end - start));
      } else {
        onSlotClickRef.current(d.roomId, d.day, minutesToTime(d.startMin));
      }
      setDrag(null);
      didDrag.current = false;
    }

    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      if (!didDrag.current && Math.abs(e.clientY - pointerDownY.current) > DRAG_THRESHOLD) {
        didDrag.current = true;
      }
      if (!didDrag.current) return;
      setDrag(prev => prev ? { ...prev, endMin: yToMin(e.clientY) } : null);
    }

    function onMouseUp(e: MouseEvent) {
      if (dragRef.current) finish(e.clientY);
    }

    function onTouchMove(e: TouchEvent) {
      // Pinch zoom
      if (e.touches.length >= 2 && pinchRef.current) {
        e.preventDefault();
        const scale = pinchDist(e.touches) / pinchRef.current.dist;
        const newH = Math.max(MIN_SLOT_HEIGHT, Math.min(MAX_SLOT_HEIGHT,
          Math.round(pinchRef.current.baseHeight * scale)));
        slotHeightRef.current = newH;
        setSlotHeight(newH);
        return;
      }
      // Single-finger drag
      if (e.touches.length !== 1 || !dragRef.current) return;
      const y = e.touches[0].clientY;
      const x = e.touches[0].clientX;
      const dy = Math.abs(y - pointerDownY.current);
      const dx = Math.abs(x - pointerDownX.current);
      // Horizontal swipe → cancel drag so ScheduleApp can handle navigation
      if (dx > DRAG_THRESHOLD && dx > dy) {
        setDrag(null);
        didDrag.current = false;
        return;
      }
      if (!didDrag.current && dy > DRAG_THRESHOLD) {
        didDrag.current = true;
      }
      if (!didDrag.current) return;
      e.preventDefault();
      setDrag(prev => prev ? { ...prev, endMin: yToMin(y) } : null);
    }

    function onTouchEnd(e: TouchEvent) {
      if (pinchRef.current) {
        if (e.touches.length < 2) pinchRef.current = null;
        return;
      }
      if (dragRef.current) finish(e.changedTouches[0].clientY);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  function beginDrag(room: Room, day: Date, clientY: number, clientX: number, cellTop: number) {
    const sh = slotHeightRef.current;
    const y = clientY - cellTop;
    const startMin = Math.max(DAY_START, Math.min(DAY_END - 15, DAY_START + Math.floor(y / sh) * 15));
    pointerDownY.current = clientY;
    pointerDownX.current = clientX;
    didDrag.current = false;
    setDrag({ roomId: room.id, day, startMin, endMin: Math.min(DAY_END, startMin + 60), cellTop });
  }

  function positionStyle(startTime: string, durationMinutes: number) {
    const startMin = timeToMinutes(startTime) - DAY_START;
    return {
      top: (startMin / 15) * slotHeight,
      height: (durationMinutes / 15) * slotHeight,
    };
  }

  // Show every 2nd hour label when zoomed out or in fitScreen
  const labelInterval = fitScreen || slotHeight <= 10 ? 2 : 1;

  const gutterClass = fitScreen ? "w-8 shrink-0" : "w-12 shrink-0";
  const outerStyle = fitScreen ? {} : { minWidth: rooms.length * days.length * 100 + 50 };
  const roomStyle = fitScreen ? {} : { minWidth: days.length * 100 };

  return (
    <div className={`${fitScreen ? "w-full" : "overflow-x-auto"} border border-gray-200`}>
      {/* Header */}
      <div className="flex" style={outerStyle}>
        <div className={gutterClass} />
        {rooms.map(room => (
          <div key={room.id} className="flex-1 min-w-0 border-l border-gray-200" style={roomStyle}>
            <div className={`font-semibold text-gray-500 text-center py-1 border-b bg-white sticky top-0 z-10 truncate px-1 ${fitScreen ? "text-[10px]" : "text-xs"}`}>
              {room.name}
            </div>
            <div
              className="grid text-center sticky top-6 z-10 bg-white border-b"
              style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
            >
              {days.map(day => (
                <div
                  key={day.toISOString()}
                  className={`border-r last:border-r-0 ${isSameDay(day, new Date()) ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-500"} ${fitScreen ? "py-0.5" : "py-1 text-xs"}`}
                >
                  {fitScreen ? (
                    <div className="flex flex-col items-center leading-none">
                      <span className="text-[9px] text-gray-400">{format(day, "EEEEE")}</span>
                      <span className={`text-[10px] ${isSameDay(day, new Date()) ? "font-bold" : ""}`}>{format(day, "d")}</span>
                    </div>
                  ) : format(day, "EEE d")}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div ref={calendarBodyRef} className="flex" style={outerStyle}>
        {/* Time gutter */}
        <div className={`${gutterClass} relative`} style={{ height: totalHeight }}>
          {timeLabels.map((label, i) => {
            if (i % labelInterval !== 0) return null;
            const top = ((timeToMinutes(label) - DAY_START) / 15) * slotHeight;
            return (
              <div
                key={label}
                className={`absolute text-gray-400 -translate-y-2 ${fitScreen ? "right-0.5 text-[9px]" : "right-1 text-xs"}`}
                style={{ top }}
              >
                {fitScreen || slotHeight <= 10 ? shortHour(label) : label}
              </div>
            );
          })}
        </div>

        {rooms.map(room => (
          <div
            key={room.id}
            className="flex-1 min-w-0 grid border-l border-gray-200"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map(day => {
              const dayStr = format(day, "yyyy-MM-dd");
              const dayAllocations = allocations.filter(
                a => a.room_id === room.id && a.date === dayStr,
              );

              const cellDrag = drag && drag.roomId === room.id && isSameDay(drag.day, day) ? drag : null;
              const previewTop = cellDrag
                ? ((Math.min(cellDrag.startMin, cellDrag.endMin) - DAY_START) / 15) * slotHeight
                : 0;
              const previewHeight = cellDrag
                ? Math.max(slotHeight, (Math.abs(cellDrag.endMin - cellDrag.startMin) / 15) * slotHeight)
                : 0;

              return (
                <div
                  key={dayStr}
                  className="relative border-r border-b last:border-r-0 select-none touch-none"
                  style={{ height: totalHeight, cursor: "crosshair" }}
                  onMouseDown={e => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    beginDrag(room, day, e.clientY, e.clientX, e.currentTarget.getBoundingClientRect().top);
                  }}
                  onTouchStart={e => {
                    if (e.touches.length === 1) {
                      const t = e.touches[0];
                      beginDrag(room, day, t.clientY, t.clientX, e.currentTarget.getBoundingClientRect().top);
                    }
                  }}
                >
                  {timeLabels.map(label => {
                    const top = ((timeToMinutes(label) - DAY_START) / 15) * slotHeight;
                    return <div key={label} className="absolute w-full border-t border-gray-100" style={{ top }} />;
                  })}

                  {cellDrag && (
                    <div
                      className="absolute left-0.5 right-0.5 rounded border-2 border-blue-400 bg-blue-100 opacity-70 z-20 pointer-events-none"
                      style={{ top: previewTop, height: previewHeight }}
                    />
                  )}

                  {dayAllocations.map(alloc => {
                    const { top, height } = positionStyle(alloc.start_time, alloc.duration_minutes);
                    const isOwn = alloc.user_id === currentUserId;
                    const color = userColor(alloc.user_id, allUserIds);
                    return (
                      <div
                        key={alloc.id}
                        className={`absolute left-0.5 right-0.5 rounded border-l-2 overflow-hidden z-10 ${color} ${isOwn ? "ring-1 ring-offset-0 ring-current" : ""} ${fitScreen ? "px-0.5" : "px-1"}`}
                        style={{ top: top + 1, height: height - 2, cursor: "pointer" }}
                        onMouseDown={e => e.stopPropagation()}
                        onTouchStart={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); onAllocationClick(alloc); }}
                        title={[alloc.profiles?.name, alloc.title, `${alloc.start_time.slice(0, 5)} (${alloc.duration_minutes}min)`].filter(Boolean).join(" · ")}
                      >
                        <div className={`font-medium leading-tight overflow-hidden ${fitScreen ? "text-[9px] break-words" : "text-xs truncate"}`}>
                          {alloc.profiles?.name?.split(" ")[0]}
                          {alloc.title && <span className="font-normal opacity-80"> · {alloc.title}</span>}
                        </div>
                        {!fitScreen && height > 24 && (
                          <div className="text-xs opacity-70 leading-tight">
                            {alloc.start_time.slice(0, 5)}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {loading && <div className="absolute inset-0 bg-white/50" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
