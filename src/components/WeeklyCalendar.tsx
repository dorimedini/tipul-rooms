"use client";

import { useRef, useEffect, useState } from "react";
import { format, isSameDay } from "date-fns";
import { AllocationWithDetails, RoomHours, HolidayBlock } from "@/lib/supabase/types";
import type { Holiday } from "@/lib/holidays";
import { timeToMinutes, minutesToTime, closedRanges } from "@/lib/allocations";

interface Room { id: string; name: string; location_id: string; room_hours?: RoomHours[] }

type DragState = {
  roomId: string;
  day: Date;
  startMin: number;
  endMin: number;
  cellTop: number;
};

/**
 * Touch devices don't drag-to-create: a tap drops a skeleton the user can nudge
 * and resize, and only tapping the skeleton opens the booking form. That keeps
 * plain swipes free for scrolling.
 */
type Skeleton = {
  roomId: string;
  day: Date;
  startMin: number;
  endMin: number;
};

type SkeletonGesture = {
  mode: "move" | "resize-start" | "resize-end";
  originY: number;
  startMin: number;
  endMin: number;
  cellTop: number;
  moved: boolean;
};

interface Props {
  days: Date[];
  rooms: Room[];
  allocations: AllocationWithDetails[];
  currentUserId: string;
  canBook: boolean;
  holidays: Holiday[];
  holidayBlocks: HolidayBlock[];
  loading: boolean;
  fitScreen?: boolean;
  animKey?: number;
  animClass?: string;
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
const SKELETON_MOVE_THRESHOLD = 6; // px before a touch counts as a drag, not a tap
const SKELETON_DEFAULT_MINUTES = 60;
// allocations.duration_minutes is checked >= 30 in the schema, so the skeleton
// must not let a user retract below a bookable length.
const SKELETON_MIN_MINUTES = 30;

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

function clampMin(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
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
  days, rooms, allocations, currentUserId, canBook, holidays, holidayBlocks, loading,
  fitScreen = false, animKey, animClass = "",
  onSlotClick, onAllocationClick,
}: Props) {
  const allUserIds = [...new Set(allocations.map(a => a.user_id))];

  // Holiday strip: only rendered on weeks that actually have one, so the date
  // row's sticky offset shifts with it.
  const holidayByDate = new Map(holidays.map(h => [h.date, h]));
  const weekHasHolidays = days.some(d => holidayByDate.has(format(d, "yyyy-MM-dd")));

  const timeLabels: string[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) {
    timeLabels.push(minutesToTime(m));
  }

  // ── Input mode ───────────────────────────────────────────────────────────
  // Coarse pointer = phone/tablet. Desktop keeps drag-to-create untouched.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setIsTouch(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // ── Zoom (pinch on mobile) ───────────────────────────────────────────────
  const [slotHeight, setSlotHeight] = useState(DEFAULT_SLOT_HEIGHT);
  const slotHeightRef = useRef(slotHeight);
  slotHeightRef.current = slotHeight;
  const totalHeight = (TOTAL_MINUTES / 15) * slotHeight;

  const calendarBodyRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ dist: number; baseHeight: number } | null>(null);

  // ── Skeleton event (touch) ───────────────────────────────────────────────
  const [skeleton, setSkeleton] = useState<Skeleton | null>(null);
  const skeletonRef = useRef<Skeleton | null>(null);
  skeletonRef.current = skeleton;
  const skeletonGesture = useRef<SkeletonGesture | null>(null);
  const skeletonMoved = useRef(false);

  // The strip wraps, so its height varies with the longest holiday name. Measure
  // it and stick the date row directly below, rather than assuming one line.
  const ROOM_NAME_HEIGHT = 24; // the sticky room-name row above it
  const holidayStripRef = useRef<HTMLDivElement>(null);
  const [stripHeight, setStripHeight] = useState(0);
  useEffect(() => {
    const el = holidayStripRef.current;
    if (!el) {
      setStripHeight(0);
      return;
    }
    const measure = () => setStripHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [weekHasHolidays, fitScreen, days.length]);

  // Navigating away abandons an unconfirmed skeleton.
  const daysKey = days.map(d => d.toISOString()).join("|");
  const roomsKey = rooms.map(r => r.id).join("|");
  useEffect(() => { setSkeleton(null); }, [daysKey, roomsKey]);

  // ── Drag-to-create ───────────────────────────────────────────────────────
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const onSlotClickRef = useRef(onSlotClick);
  onSlotClickRef.current = onSlotClick;
  const didDrag = useRef(false);
  const pointerDownY = useRef(0);

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
      // Moving or resizing the skeleton. Anything else is left to the browser,
      // so an ordinary swipe scrolls the page.
      const g = skeletonGesture.current;
      if (e.touches.length !== 1 || !g) return;

      const dy = e.touches[0].clientY - g.originY;
      if (!g.moved && Math.abs(dy) < SKELETON_MOVE_THRESHOLD) return;
      g.moved = true;
      e.preventDefault();

      const sh = slotHeightRef.current;
      const deltaMin = Math.round(dy / sh) * 15;
      const span = g.endMin - g.startMin;

      setSkeleton(prev => {
        if (!prev) return prev;
        if (g.mode === "move") {
          const start = clampMin(g.startMin + deltaMin, DAY_START, DAY_END - span);
          return { ...prev, startMin: start, endMin: start + span };
        }
        if (g.mode === "resize-start") {
          const start = clampMin(g.startMin + deltaMin, DAY_START, g.endMin - SKELETON_MIN_MINUTES);
          return { ...prev, startMin: start };
        }
        const end = clampMin(g.endMin + deltaMin, g.startMin + SKELETON_MIN_MINUTES, DAY_END);
        return { ...prev, endMin: end };
      });
    }

    function onTouchEnd(e: TouchEvent) {
      if (pinchRef.current) {
        if (e.touches.length < 2) pinchRef.current = null;
        return;
      }
      if (skeletonGesture.current) {
        // A gesture that actually moved must not also register as a tap.
        skeletonMoved.current = skeletonGesture.current.moved;
        skeletonGesture.current = null;
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

  function closedFor(room: Room, day: Date): Array<[number, number]> {
    return closedRanges(room.room_hours ?? [], day.getDay(), DAY_START, DAY_END);
  }

  // Holiday blocks are global — every room in every location, matched on date.
  function blocksFor(day: Date): HolidayBlock[] {
    const key = format(day, "yyyy-MM-dd");
    return holidayBlocks.filter(b => b.date === key);
  }

  function minuteAt(clientY: number, cellTop: number): number {
    const sh = slotHeightRef.current;
    return clampMin(
      DAY_START + Math.floor((clientY - cellTop) / sh) * 15,
      DAY_START,
      DAY_END - 15
    );
  }

  function isBlockedAt(room: Room, day: Date, minute: number): boolean {
    if (closedFor(room, day).some(([from, to]) => minute >= from && minute < to)) return true;
    return blocksFor(day).some(
      b => minute >= timeToMinutes(b.start_time) && minute < timeToMinutes(b.end_time)
    );
  }

  // Touch: a tap either dismisses the current skeleton or drops a new one.
  function handleCellTap(room: Room, day: Date, clientY: number, cellTop: number) {
    if (skeletonRef.current) {
      setSkeleton(null);
      return;
    }
    if (!canBook) return;
    const startMin = minuteAt(clientY, cellTop);
    if (isBlockedAt(room, day, startMin)) return;
    setSkeleton({
      roomId: room.id,
      day,
      startMin,
      endMin: Math.min(DAY_END, startMin + SKELETON_DEFAULT_MINUTES),
    });
  }

  function beginSkeletonGesture(
    e: React.TouchEvent,
    mode: "move" | "resize-start" | "resize-end"
  ) {
    const current = skeletonRef.current;
    if (!current || e.touches.length !== 1) return;
    e.stopPropagation();
    skeletonMoved.current = false;
    skeletonGesture.current = {
      mode,
      originY: e.touches[0].clientY,
      startMin: current.startMin,
      endMin: current.endMin,
      cellTop: 0,
      moved: false,
    };
  }

  function beginDrag(room: Room, day: Date, clientY: number, cellTop: number) {
    const sh = slotHeightRef.current;
    const y = clientY - cellTop;
    const startMin = Math.max(DAY_START, Math.min(DAY_END - 15, DAY_START + Math.floor(y / sh) * 15));
    // Closed periods and holiday blocks are not bookable; the server agrees.
    if (closedFor(room, day).some(([from, to]) => startMin >= from && startMin < to)) return;
    if (blocksFor(day).some(b =>
      startMin >= timeToMinutes(b.start_time) && startMin < timeToMinutes(b.end_time))) return;
    pointerDownY.current = clientY;
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
  const roomsStyle = fitScreen ? {} : { minWidth: rooms.length * days.length * 100 };
  const roomStyle = fitScreen ? {} : { minWidth: days.length * 100 };

  return (
    <div className={`${fitScreen ? "w-full" : "overflow-x-auto"} border border-border bg-background`}>
      {/* Header */}
      <div className="flex">
        {/* Time gutter — static, never animated */}
        <div className={gutterClass} />
        {/* Day columns — animated */}
        <div key={animKey} className={`flex flex-1 min-w-0 ${animClass}`} style={roomsStyle}>
          {rooms.map((room, roomIndex) => (
            <div key={room.id} className="flex-1 min-w-0 border-l border-border" style={roomStyle}>
              <div className={`font-semibold text-muted-foreground text-center py-1 border-b bg-background sticky top-0 z-10 truncate px-1 ${fitScreen ? "text-[10px]" : "text-xs"}`}>
                {room.name}
              </div>
              {weekHasHolidays && (
                <div
                  ref={roomIndex === 0 ? holidayStripRef : undefined}
                  className="grid text-center sticky top-6 z-10 min-h-6 bg-background"
                  style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
                >
                  {days.map(day => {
                    const holiday = holidayByDate.get(format(day, "yyyy-MM-dd"));
                    return (
                      <div
                        key={day.toISOString()}
                        title={holiday?.full}
                        className={`flex items-center justify-center border-r last:border-r-0 px-0.5 py-0.5 leading-tight ${
                          fitScreen ? "text-[8px]" : "text-[10px]"
                        } ${
                          holiday
                            ? holiday.chag
                              ? "bg-[#780000] text-[#fdf0d5] font-semibold"
                              : "bg-[#780000]/15 text-[#780000] font-medium"
                            : ""
                        }`}
                      >
                        <span className="break-words hyphens-auto">{holiday?.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                className="grid text-center sticky z-10 bg-background border-b"
                style={{
                  gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                  top: ROOM_NAME_HEIGHT + (weekHasHolidays ? stripHeight : 0),
                }}
              >
                {days.map(day => (
                  <div
                    key={day.toISOString()}
                    className={`border-r last:border-r-0 ${isSameDay(day, new Date()) ? "bg-[#669bbc]/20 text-[#003049] font-semibold" : "text-muted-foreground"} ${fitScreen ? "py-0.5" : "py-1 text-xs"}`}
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
      </div>

      {/* Body */}
      <div ref={calendarBodyRef} className="flex">
        {/* Time gutter — static, never animated */}
        <div className={`${gutterClass} relative`} style={{ height: totalHeight }}>
          {timeLabels.map((label, i) => {
            if (i % labelInterval !== 0) return null;
            const top = ((timeToMinutes(label) - DAY_START) / 15) * slotHeight;
            return (
              <div
                key={label}
                className={`absolute text-muted-foreground -translate-y-2 ${fitScreen ? "right-0.5 text-[9px]" : "right-1 text-xs"}`}
                style={{ top }}
              >
                {fitScreen || slotHeight <= 10 ? shortHour(label) : label}
              </div>
            );
          })}
        </div>
        {/* Day columns — animated */}
        <div key={animKey} className={`flex flex-1 min-w-0 ${animClass}`} style={roomsStyle}>
        {rooms.map(room => (
          <div
            key={room.id}
            className="flex-1 min-w-0 grid border-l border-border"
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
                  className={`relative border-r border-b last:border-r-0 select-none ${
                    isTouch ? "touch-pan-y" : "touch-none"
                  }`}
                  style={{
                    height: totalHeight,
                    cursor: !isTouch && canBook ? "crosshair" : "default",
                  }}
                  onMouseDown={e => {
                    // Touch devices synthesise mouse events after a tap; ignore them.
                    if (isTouch || !canBook || e.button !== 0) return;
                    e.preventDefault();
                    beginDrag(room, day, e.clientY, e.currentTarget.getBoundingClientRect().top);
                  }}
                  onClick={e => {
                    // Only fires after a genuine tap — the browser suppresses click
                    // when the gesture turned into a scroll.
                    if (!isTouch) return;
                    handleCellTap(room, day, e.clientY, e.currentTarget.getBoundingClientRect().top);
                  }}
                >
                  {closedFor(room, day).map(([from, to]) => (
                    <div
                      key={`closed-${from}`}
                      className="absolute inset-x-0 bg-muted-foreground/15 pointer-events-none"
                      style={{
                        top: ((from - DAY_START) / 15) * slotHeight,
                        height: ((to - from) / 15) * slotHeight,
                      }}
                    />
                  ))}

                  {timeLabels.map(label => {
                    const top = ((timeToMinutes(label) - DAY_START) / 15) * slotHeight;
                    return <div key={label} className="absolute w-full border-t border-border/40" style={{ top }} />;
                  })}

                  {cellDrag && (
                    <div
                      className="absolute left-0.5 right-0.5 rounded border-2 border-[#c1121f] bg-[#c1121f]/15 opacity-80 z-20 pointer-events-none"
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
                        onClick={e => { e.stopPropagation(); setSkeleton(null); onAllocationClick(alloc); }}
                        title={[alloc.profiles?.name, alloc.title, `${alloc.start_time.slice(0, 5)} (${alloc.duration_minutes}min)`].filter(Boolean).join(" · ")}
                      >
                        <div className={`font-medium leading-tight overflow-hidden ${fitScreen ? "text-[9px] break-words" : "text-xs truncate"}`}>
                          {alloc.title || alloc.start_time.slice(0, 5)}
                        </div>
                        {!fitScreen && height > 24 && alloc.title && (
                          <div className="text-xs opacity-70 leading-tight">
                            {alloc.start_time.slice(0, 5)}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {skeleton && skeleton.roomId === room.id && isSameDay(skeleton.day, day) && (
                    <div
                      className="absolute left-0.5 right-0.5 z-30 touch-none rounded border-2 border-[#003049] bg-[#003049]/20"
                      style={{
                        top: ((skeleton.startMin - DAY_START) / 15) * slotHeight,
                        height: ((skeleton.endMin - skeleton.startMin) / 15) * slotHeight,
                      }}
                      onTouchStart={e => beginSkeletonGesture(e, "move")}
                      onClick={e => {
                        e.stopPropagation();
                        if (skeletonMoved.current) { skeletonMoved.current = false; return; }
                        onSlotClick(
                          skeleton.roomId,
                          skeleton.day,
                          minutesToTime(skeleton.startMin),
                          skeleton.endMin - skeleton.startMin
                        );
                        setSkeleton(null);
                      }}
                    >
                      {/* Grab bars: drag to change the start or the end */}
                      <div
                        className="absolute -top-1 left-0 right-0 h-4 touch-none"
                        onTouchStart={e => beginSkeletonGesture(e, "resize-start")}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="mx-auto mt-1 h-1 w-8 rounded-full bg-[#003049]" />
                      </div>
                      <div
                        className="absolute -bottom-1 left-0 right-0 h-4 touch-none"
                        onTouchStart={e => beginSkeletonGesture(e, "resize-end")}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="mx-auto mt-2 h-1 w-8 rounded-full bg-[#003049]" />
                      </div>

                      <div
                        className={`pointer-events-none overflow-hidden px-0.5 pt-1 font-medium leading-tight text-[#003049] ${
                          fitScreen ? "text-[8px]" : "px-1 text-[10px]"
                        }`}
                      >
                        {minutesToTime(skeleton.startMin)}
                        {!fitScreen && `–${minutesToTime(skeleton.endMin)}`}
                        {!fitScreen && <div className="opacity-70">Tap to book</div>}
                      </div>
                    </div>
                  )}

                  {blocksFor(day).map(block => {
                    const top = ((timeToMinutes(block.start_time) - DAY_START) / 15) * slotHeight;
                    const height =
                      ((timeToMinutes(block.end_time) - timeToMinutes(block.start_time)) / 15) * slotHeight;
                    return (
                      <div
                        key={block.id}
                        title={`${block.title} · ${block.start_time.slice(0, 5)}–${block.end_time.slice(0, 5)}`}
                        className={`absolute left-0.5 right-0.5 z-10 overflow-hidden rounded bg-[#780000] font-semibold leading-tight text-[#fdf0d5] ${
                          fitScreen ? "px-0.5 text-[9px]" : "px-1 text-xs"
                        }`}
                        style={{ top: top + 1, height: height - 2 }}
                      >
                        <span className="block break-words">{block.title}</span>
                      </div>
                    );
                  })}

                  {loading && <div className="absolute inset-0 bg-background/50" />}
                </div>
              );
            })}
          </div>
        ))}
        </div> {/* end animated rooms wrapper */}
      </div> {/* end body flex row */}
    </div>
  );
}
