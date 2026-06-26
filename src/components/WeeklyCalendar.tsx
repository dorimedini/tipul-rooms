"use client";

import { format, isSameDay } from "date-fns";
import { AllocationWithDetails } from "@/lib/supabase/types";
import { timeToMinutes, minutesToTime, START_TIMES } from "@/lib/allocations";

interface Room { id: string; name: string; location_id: string }

interface Props {
  days: Date[];
  rooms: Room[];
  allocations: AllocationWithDetails[];
  currentUserId: string;
  loading: boolean;
  fitScreen?: boolean;
  onSlotClick: (roomId: string, date: Date, startTime: string) => void;
  onAllocationClick: (allocation: AllocationWithDetails) => void;
}

const SLOT_HEIGHT = 16; // px per 15 minutes
const DAY_START = 7 * 60; // 7:00 AM in minutes
const DAY_END = 22 * 60; // 10:00 PM in minutes
const TOTAL_MINUTES = DAY_END - DAY_START;

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

export function WeeklyCalendar({ days, rooms, allocations, currentUserId, loading, fitScreen = false, onSlotClick, onAllocationClick }: Props) {
  const allUserIds = [...new Set(allocations.map(a => a.user_id))];

  const timeLabels: string[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) {
    timeLabels.push(minutesToTime(m));
  }

  const totalHeight = (TOTAL_MINUTES / 15) * SLOT_HEIGHT;

  function positionStyle(startTime: string, durationMinutes: number) {
    const startMin = timeToMinutes(startTime) - DAY_START;
    const top = (startMin / 15) * SLOT_HEIGHT;
    const height = (durationMinutes / 15) * SLOT_HEIGHT;
    return { top, height };
  }

  function handleSlotClick(room: Room, day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const minutesFromStart = Math.floor((clickY / SLOT_HEIGHT) * 15 / 15) * 15;
    const totalMinutes = DAY_START + minutesFromStart;
    const clamped = Math.max(DAY_START, Math.min(DAY_END - 30, totalMinutes));
    const snapped = Math.round(clamped / 15) * 15;
    onSlotClick(room.id, day, minutesToTime(snapped));
  }

  const gutterClass = fitScreen ? "w-8 shrink-0" : "w-12 shrink-0";
  const outerStyle = fitScreen ? {} : { minWidth: rooms.length * days.length * 100 + 50 };
  const roomStyle = fitScreen ? {} : { minWidth: days.length * 100 };

  return (
    <div className={fitScreen ? "w-full" : "overflow-x-auto"}>
      {/* Header: day columns per room */}
      <div className="flex" style={outerStyle}>
        <div className={gutterClass} />
        {rooms.map(room => (
          <div key={room.id} className="flex-1 min-w-0" style={roomStyle}>
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
                  className={`border-r ${isSameDay(day, new Date()) ? "bg-blue-50 text-blue-700 font-semibold" : "text-gray-500"} ${fitScreen ? "py-0.5" : "py-1 text-xs"}`}
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
      <div className="flex" style={outerStyle}>
        {/* Time gutter */}
        <div className={`${gutterClass} relative`} style={{ height: totalHeight }}>
          {timeLabels.map((label, i) => {
            if (fitScreen && i % 2 !== 0) return null;
            const offsetMin = timeToMinutes(label) - DAY_START;
            const top = (offsetMin / 15) * SLOT_HEIGHT;
            return (
              <div
                key={label}
                className={`absolute text-gray-400 -translate-y-2 ${fitScreen ? "right-0.5 text-[9px]" : "right-1 text-xs"}`}
                style={{ top }}
              >
                {fitScreen ? shortHour(label) : label}
              </div>
            );
          })}
        </div>

        {rooms.map(room => (
          <div
            key={room.id}
            className="flex-1 min-w-0 grid"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {days.map(day => {
              const dayStr = format(day, "yyyy-MM-dd");
              const dayAllocations = allocations.filter(
                a => a.room_id === room.id && a.date === dayStr
              );
              return (
                <div
                  key={dayStr}
                  className="relative border-r border-b cursor-pointer hover:bg-gray-50 transition-colors"
                  style={{ height: totalHeight }}
                  onClick={(e) => handleSlotClick(room, day, e)}
                >
                  {timeLabels.map(label => {
                    const offsetMin = timeToMinutes(label) - DAY_START;
                    const top = (offsetMin / 15) * SLOT_HEIGHT;
                    return (
                      <div key={label} className="absolute w-full border-t border-gray-100" style={{ top }} />
                    );
                  })}

                  {dayAllocations.map(alloc => {
                    const { top, height } = positionStyle(alloc.start_time, alloc.duration_minutes);
                    const isOwn = alloc.user_id === currentUserId;
                    const color = userColor(alloc.user_id, allUserIds);
                    return (
                      <div
                        key={alloc.id}
                        className={`absolute left-0.5 right-0.5 rounded border-l-2 overflow-hidden cursor-pointer z-10 ${color} ${isOwn ? "ring-1 ring-offset-0 ring-current" : ""} ${fitScreen ? "" : "px-1"}`}
                        style={{ top: top + 1, height: height - 2 }}
                        onClick={(e) => { e.stopPropagation(); onAllocationClick(alloc); }}
                        title={[alloc.profiles?.name, alloc.title, `${alloc.start_time.slice(0,5)} (${alloc.duration_minutes}min)`].filter(Boolean).join(" · ")}
                      >
                        {!fitScreen && (
                          <>
                            <div className="text-xs font-medium leading-tight truncate">
                              {alloc.profiles?.name?.split(" ")[0]}
                              {alloc.title && <span className="font-normal opacity-80"> · {alloc.title}</span>}
                            </div>
                            {height > 24 && (
                              <div className="text-xs opacity-70 leading-tight">
                                {alloc.start_time.slice(0, 5)}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {loading && (
                    <div className="absolute inset-0 bg-white/50" />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
