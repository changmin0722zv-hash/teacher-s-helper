"use client";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  SCHOOL,
  schoolSnapshotSchema,
  type SchoolSnapshot,
  type SchoolEvent,
} from "@/lib/school";

const DAY = 86400000;
function readCache(year: number): SchoolSnapshot | undefined {
  try {
    const parsed = schoolSnapshotSchema.safeParse(
      JSON.parse(
        localStorage.getItem(`school-events-v1:${SCHOOL.schoolCode}:${year}`) ||
          "null",
      ),
    );
    if (
      parsed.success &&
      parsed.data.year === year &&
      Date.parse(parsed.data.checkedAt) <= Date.now() &&
      parsed.data.events.every((e) => e.date.startsWith(String(year)))
    )
      return parsed.data;
  } catch {
    /* Storage may be unavailable. Live reads still work. */
  }
}
export function useSchoolEvents(from: string, to: string) {
  const yearsKey = [
    ...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]),
  ]
    .sort()
    .join(",");
  const [snapshots, setSnapshots] = useState<Record<number, SchoolSnapshot>>(
    {},
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const lastRefresh = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const force = lastRefresh.current !== revision;
    lastRefresh.current = revision;
    setLoading(true);
    setError("");
    const years = yearsKey.split(",").map(Number);
    void Promise.all(
      years.map(async (year) => {
        const cached = readCache(year);
        if (cached) setSnapshots((prev) => ({ ...prev, [year]: cached }));
        if (!force && cached && Date.now() - Date.parse(cached.checkedAt) < DAY)
          return;
        try {
          const response = await fetch(`/api/school-events?year=${year}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error || "학교 일정을 불러오지 못했습니다.");
          const snapshot = schoolSnapshotSchema.parse(body);
          if (
            snapshot.year !== year ||
            snapshot.events.some((e) => !e.date.startsWith(String(year)))
          )
            throw new Error("학교 일정의 연도를 확인하지 못했습니다.");
          if (controller.signal.aborted) return;
          setSnapshots((prev) => ({ ...prev, [year]: snapshot }));
          try {
            localStorage.setItem(
              `school-events-v1:${SCHOOL.schoolCode}:${year}`,
              JSON.stringify(snapshot),
            );
          } catch {
            /* Use the in-memory copy. */
          }
        } catch (e) {
          if (!controller.signal.aborted)
            setError(
              e instanceof Error
                ? e.message
                : "학교 일정을 불러오지 못했습니다.",
            );
        }
      }),
    ).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [yearsKey, revision]);
  const years = yearsKey.split(",").map(Number);
  const available = years.flatMap((year) =>
    snapshots[year] ? [snapshots[year]] : [],
  );
  const checkedAt = available.length
    ? available.map((s) => s.checkedAt).sort()[0]
    : "";
  const fresh =
    available.length === years.length &&
    available.every((s) => Date.now() - Date.parse(s.checkedAt) < DAY);
  return {
    events: available.flatMap((s) => s.events),
    error,
    loading,
    checkedAt,
    fresh,
    refresh: () => setRevision((v) => v + 1),
  };
}
export type SchoolSync = ReturnType<typeof useSchoolEvents>;
export function SchoolSyncBar({
  sync,
  visible,
  onToggle,
}: {
  sync: SchoolSync;
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="school-sync-bar">
      <div>
        <strong>{SCHOOL.name}</strong>
        <p>
          {sync.loading
            ? "학교 일정 확인 중…"
            : sync.error ||
              (sync.checkedAt
                ? `최근 확인 ${new Date(sync.checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`
                : "학교 일정 연결 대기")}
          {sync.error &&
            sync.checkedAt &&
            ` · 마지막 확인 ${new Date(sync.checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`}
        </p>
      </div>
      <div className="inline-actions">
        <label>
          <input type="checkbox" checked={visible} onChange={onToggle} /> 학교
          행사 보기
        </label>
        <button
          className="button"
          disabled={sync.loading}
          onClick={sync.refresh}
        >
          <RefreshCw size={16} /> 학교 일정 새로고침
        </button>
      </div>
    </div>
  );
}
export function SchoolEventList({ events }: { events: SchoolEvent[] }) {
  return (
    <>
      {events.map((event) => (
        <details className="school-event" key={event.id}>
          <summary>학교 · {event.title}</summary>
          <p>
            {event.grades.length
              ? `${event.grades.join("·")}학년`
              : "대상 학년 미지정"}
            {event.dayType ? ` · ${event.dayType}` : ""}
          </p>
          {event.description && <p>{event.description}</p>}
          <small>나이스 학사일정 · {event.date}</small>
        </details>
      ))}
    </>
  );
}
