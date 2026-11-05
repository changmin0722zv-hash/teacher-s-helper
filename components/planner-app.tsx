"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  CalendarDays,
  Sun,
  Columns3,
  ListChecks,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  RefreshCw,
  X,
  Copy,
  Trash2,
  Download,
  Check,
  LogOut,
  Layers3,
  Settings2,
  MoreHorizontal,
} from "lucide-react";
import {
  copyLesson,
  dueLabel,
  koreaToday,
  newLesson,
  newUnit,
  plannerSchema,
  shiftDate,
  STATUSES,
  SUBJECTS,
  SUBJECT_COLORS,
  unlinkUnit,
  type Lesson,
  type Planner,
  type Snapshot,
  type Unit,
  type TimetableSlot,
} from "@/lib/planner";

import TodayDashboard, {
  type QuickDraft,
  type PreparationAction,
} from "./today-dashboard";
import { appendFeedback } from "@/lib/today";

import TimetableSettings from "./timetable-settings";
import {
  useSchoolEvents,
  SchoolSyncBar,
  SchoolEventList,
} from "./school-events";
import { eventsFor } from "@/lib/school";
import { mondayOf, weekCandidates, lessonsFromWeek } from "@/lib/timetable";
import TeachingLibrary, { type Reuse } from "./teaching-library";
import { sourceReference } from "@/lib/library-model";
import { loadPlanner } from "@/lib/cloud-client";
import { plannerChanges } from "@/lib/planner-sync";
import { lessonItem, unitItem } from "@/lib/library-items";

import CalendarMenu, {
  type CalendarMenuTarget,
  type CalendarAction,
} from "./calendar-menu";

type View = "today" | "calendar" | "board" | "plans" | "timetable" | "library";
const viewLabels: Record<View, string> = {
  today: "오늘의 수업",
  calendar: "수업 달력",
  board: "준비상태 보드",
  plans: "수업·단원 계획",
  timetable: "학교·기초시간표",
  library: "수업 자료실",
};
type Editor =
  | { kind: "lesson"; value: Lesson; fresh: boolean }
  | { kind: "unit"; value: Unit; fresh: boolean };
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const color = (subject: string) => SUBJECT_COLORS[subject] || "#b6c5dd";
function download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2) + "\n"], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PlannerApp({
  login,
  demo,
}: {
  login: string;
  demo: boolean;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [view, setView] = useState<View>("today");
  const [planTab, setPlanTab] = useState<"lessons" | "units">("units");
  const [today, setToday] = useState(koreaToday);
  const [anchor, setAnchor] = useState(koreaToday);
  const [timetableWeek, setTimetableWeek] = useState(koreaToday);
  const [slotDraft, setSlotDraft] = useState<TimetableSlot | null>(null);
  const [showSchoolEvents, setShowSchoolEvents] = useState(true);
  const schoolAnchor =
    view === "timetable"
      ? mondayOf(timetableWeek)
      : view === "calendar"
        ? anchor.slice(0, 7) + "-01"
        : today;
  const schoolSync = useSchoolEvents(
    shiftDate(schoolAnchor, -6),
    shiftDate(schoolAnchor, 42),
  );
  const [calendarMode, setCalendarMode] = useState<"month" | "week">("month");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [classroom, setClassroom] = useState("");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [quickDrafts, setQuickDrafts] = useState<Record<string, QuickDraft>>(
    {},
  );
  const hasQuickDrafts = Object.values(quickDrafts).some(
    (draft) => draft.note || draft.preparation,
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [libraryDirty, setLibraryDirty] = useState(false);
  const [calendarMenu, setCalendarMenu] = useState<CalendarMenuTarget | null>(
    null,
  );
  const [copiedLesson, setCopiedLesson] = useState<Lesson | null>(null);
  const [deletedLesson, setDeletedLesson] = useState<{
    lesson: Lesson;
    expires: number;
  } | null>(null);
  const closeCalendarMenu = useCallback(() => setCalendarMenu(null), []);
  useEffect(() => {
    setCalendarMenu(null);
  }, [
    view,
    anchor,
    calendarMode,
    subject,
    grade,
    classroom,
    search,
    snapshot,
    busy,
    loading,
  ]);
  useEffect(() => {
    if (!deletedLesson) return;
    const timer = setTimeout(
      () => setDeletedLesson(null),
      Math.max(0, deletedLesson.expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [deletedLesson]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSnapshot(await loadPlanner());
      setConflict(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("libraryId"))
      setView("library");
    void load();
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setToday(koreaToday()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (editor && !dialog.current?.open) dialog.current?.showModal();
    if (!editor && dialog.current?.open) dialog.current?.close();
  }, [editor]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty || hasQuickDrafts || slotDraft || busy || libraryDirty)
        e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, hasQuickDrafts, slotDraft, busy, libraryDirty]);

  async function save(data: Planner): Promise<boolean> {
    if (!snapshot || saving.current || conflict) return false;
    const checked = plannerSchema.safeParse(data);
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return false;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/planner", {
        method: snapshot.backend === "database" ? "PATCH" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          snapshot.backend === "database"
            ? {
                changes: plannerChanges(snapshot.data, checked.data),
                sha: snapshot.sha,
              }
            : { data: checked.data, sha: snapshot.sha },
        ),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        throw new Error(body.error);
      }
      setSnapshot({
        data: body.data ? plannerSchema.parse(body.data) : checked.data,
        sha: body.sha,
        backend: snapshot.backend,
      });
      setNotice(
        demo
          ? "로컬 데모에 저장했습니다."
          : snapshot.backend === "database"
            ? "클라우드 DB에 저장했습니다."
            : "GitHub에 저장했습니다.",
      );
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "저장하지 못했습니다. 연결을 확인해 주세요.",
      );
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function reuseLibrary(request: Reuse): Promise<boolean> {
    if (!snapshot) return false;
    const { item, excerpt, mode } = request;
    const reference = sourceReference(item, excerpt, mode);
    if (mode === "adapt" && !request.date) {
      const now = new Date().toISOString();
      const classification = {
        ...item.classification,
        materialStatus: "수정 중 초안",
        standards: item.classification.standards.map((s) => ({
          ...s,
          alignment: "재검토",
        })),
        favorite: false,
      };
      const resource = {
        id: crypto.randomUUID(),
        title: `${item.title} · 재구성`,
        type: "초안",
        content: excerpt,
        links: [],
        classification,
        references: [reference],
        createdAt: now,
        updatedAt: now,
      };
      const response = await fetch("/api/library", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: resource.id,
          version: "",
          classification,
          resource,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      return true;
    }
    if (mode === "adapt") {
      const lesson = {
        ...newLesson(request.date!),
        title: item.title,
        subject: item.subject || "교과 미정",
        grade: request.grade!,
        classroom: request.classroom!,
        activities: excerpt,
        references: [reference],
      };
      return save({
        ...snapshot.data,
        lessons: [...snapshot.data.lessons, lesson],
      });
    }
    const target = snapshot.data.lessons.find((l) => l.id === request.targetId);
    if (!target)
      throw new Error(
        "선택한 수업을 찾을 수 없습니다. 최신 내용을 불러와 주세요.",
      );
    if (
      target.references?.some(
        (r) =>
          r.sourceId === reference.sourceId &&
          r.version === reference.version &&
          r.excerpt === reference.excerpt &&
          r.mode === reference.mode,
      )
    )
      throw new Error("동일한 자료와 내용이 이미 연결되어 있습니다.");
    return save({
      ...snapshot.data,
      lessons: snapshot.data.lessons.map((l) =>
        l.id === target.id
          ? {
              ...l,
              activities:
                mode === "excerpt"
                  ? [l.activities, `[가져온 활동: ${item.title}]\n${excerpt}`]
                      .filter(Boolean)
                      .join("\n\n")
                  : l.activities,
              references: [...(l.references || []), reference],
              updatedAt: new Date().toISOString(),
            }
          : l,
      ),
    });
  }
  function open(next: Editor) {
    setEditor(next);
    setDirty(false);
    setNotice("");
    if (!conflict) setError("");
  }
  function close() {
    if (busy || (dirty && !confirm("저장하지 않은 변경사항을 닫을까요?")))
      return;
    setEditor(null);
    setDirty(false);
  }
  function editLesson(patch: Partial<Lesson>) {
    if (editor?.kind === "lesson") {
      setEditor({ ...editor, value: { ...editor.value, ...patch } });
      setDirty(true);
    }
  }
  function editUnit(patch: Partial<Unit>) {
    if (editor?.kind === "unit") {
      setEditor({ ...editor, value: { ...editor.value, ...patch } });
      setDirty(true);
    }
  }
  function beginLesson(date = today, unit?: Unit, sessionId?: string) {
    const lesson = newLesson(date);
    if (grade) lesson.grade = Number(grade);
    if (subject) lesson.subject = subject;
    if (classroom) lesson.classroom = classroom;
    if (unit) {
      const idx = unit.sessions.findIndex((s) => s.id === sessionId);
      Object.assign(lesson, {
        unitId: unit.id,
        sessionId: sessionId || null,
        grade: unit.grade,
        subject: unit.subject,
        title: `${unit.title}${idx >= 0 ? ` · ${idx + 1}차시` : ""}`,
        activities: unit.sessions[idx]?.activity || "",
      });
    }
    open({ kind: "lesson", value: lesson, fresh: true });
  }
  async function submitEditor(e: React.FormEvent) {
    e.preventDefault();
    if (!editor || !snapshot) return;
    const value = { ...editor.value, updatedAt: new Date().toISOString() };
    const data: Planner =
      editor.kind === "lesson"
        ? {
            ...snapshot.data,
            lessons: [
              ...snapshot.data.lessons.filter((l) => l.id !== value.id),
              value as Lesson,
            ],
          }
        : {
            ...snapshot.data,
            units: [
              ...snapshot.data.units.filter((u) => u.id !== value.id),
              value as Unit,
            ],
          };
    if (await save(data)) {
      setEditor(null);
      setDirty(false);
    }
  }
  async function removeEditor() {
    if (
      !editor ||
      !snapshot ||
      !confirm(
        editor.kind === "unit"
          ? "이 단원을 삭제할까요? 연결된 수업은 남고 단원 연결만 해제됩니다."
          : "이 수업 계획을 삭제할까요?",
      )
    )
      return;
    const data =
      editor.kind === "unit"
        ? unlinkUnit(snapshot.data, editor.value.id)
        : {
            ...snapshot.data,
            lessons: snapshot.data.lessons.filter(
              (l) => l.id !== editor.value.id,
            ),
          };
    if (await save(data)) {
      setEditor(null);
      setDirty(false);
    }
  }
  function showCalendarMenu(
    e: React.MouseEvent<HTMLElement>,
    date: string,
    lessonId?: string,
    fromButton = false,
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || loading || conflict || !snapshot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setCalendarMenu({
      date,
      lessonId,
      trigger: !fromButton
        ? e.currentTarget.querySelector<HTMLButtonElement>(".calendar-event") ||
          e.currentTarget
        : e.currentTarget,
      x: fromButton ? rect.left : e.clientX,
      y: fromButton ? rect.bottom : e.clientY,
    });
  }
  async function deleteCalendarLesson(lesson: Lesson) {
    if (!snapshot || busy || conflict) return;
    const draft = quickDrafts[lesson.id];
    if (draft?.note || draft?.preparation) {
      setError(
        "이 수업에 저장하지 않은 빠른 기록이 있습니다. 오늘의 수업에서 먼저 저장하거나 비워 주세요.",
      );
      return;
    }
    if (
      !confirm(
        `${lesson.date} · ${lesson.grade}학년 ${lesson.classroom}반${lesson.period ? ` · ${lesson.period}교시` : ""}\n${lesson.title}\n이 수업을 삭제할까요?`,
      )
    )
      return;
    if (
      await save({
        ...snapshot.data,
        lessons: snapshot.data.lessons.filter((l) => l.id !== lesson.id),
      })
    ) {
      setDeletedLesson({ lesson, expires: Date.now() + 15000 });
    }
  }
  async function undoCalendarDelete() {
    if (
      !snapshot ||
      !deletedLesson ||
      busy ||
      conflict ||
      Date.now() >= deletedLesson.expires
    )
      return;
    const { lesson } = deletedLesson;
    if (snapshot.data.lessons.some((l) => l.id === lesson.id)) {
      setDeletedLesson(null);
      return;
    }
    if (
      await save({
        ...snapshot.data,
        lessons: [...snapshot.data.lessons, lesson],
      })
    )
      setDeletedLesson(null);
  }
  function calendarAction(action: CalendarAction) {
    if (!calendarMenu || !snapshot || busy || conflict) return;
    const lesson = snapshot.data.lessons.find(
      (l) => l.id === calendarMenu.lessonId,
    );
    if (action === "add") beginLesson(calendarMenu.date);
    if (action === "edit" && lesson)
      open({ kind: "lesson", value: lesson, fresh: false });
    if (action === "copy" && lesson) {
      setCopiedLesson(structuredClone(lesson));
      setNotice(
        `‘${lesson.title}’ 복사됨 · 원하는 날짜에서 붙여넣기를 선택하세요. 새로고침하면 복사 내용은 비워집니다.`,
      );
    }
    if (action === "paste" && copiedLesson) {
      const value = copyLesson(copiedLesson);
      value.date = calendarMenu.date;
      // A copied plan may outlive a deleted unit or session in this tab.
      const unit = snapshot.data.units.find((u) => u.id === value.unitId);
      if (!unit) {
        value.unitId = null;
        value.sessionId = null;
      } else if (!unit.sessions.some((s) => s.id === value.sessionId))
        value.sessionId = null;
      open({ kind: "lesson", value, fresh: true });
      setDirty(true);
    }
    if (action === "delete" && lesson) void deleteCalendarLesson(lesson);
  }
  async function changeStatus(id: string, status: Lesson["status"]) {
    if (!snapshot || busy || conflict) return;
    const lesson = snapshot.data.lessons.find((l) => l.id === id);
    if (!lesson || lesson.status === status) return;
    await save({
      ...snapshot.data,
      lessons: snapshot.data.lessons.map((l) =>
        l.id === id ? { ...l, status, updatedAt: new Date().toISOString() } : l,
      ),
    });
  }
  function setQuickDraft(id: string, patch: Partial<QuickDraft>) {
    setQuickDrafts((drafts) => ({
      ...drafts,
      [id]: { ...(drafts[id] || { note: "", preparation: "" }), ...patch },
    }));
  }
  async function recordQuickly(id: string, complete: boolean) {
    if (!snapshot || saving.current || conflict) return;
    const current = snapshot.data.lessons.find((lesson) => lesson.id === id);
    if (!current) return;
    const addition = quickDrafts[id]?.note || "";
    if (!addition.trim() && (!complete || current.status === "수업 완료"))
      return;
    const updated = {
      ...current,
      feedback: appendFeedback(current.feedback, addition),
      status: complete ? ("수업 완료" as const) : current.status,
      updatedAt: new Date().toISOString(),
    };
    if (
      await save({
        ...snapshot.data,
        lessons: snapshot.data.lessons.map((lesson) =>
          lesson.id === id ? updated : lesson,
        ),
      })
    ) {
      setQuickDraft(id, { note: "" });
    }
  }
  async function updatePreparation(id: string, action: PreparationAction) {
    if (!snapshot || saving.current || conflict) return;
    const current = snapshot.data.lessons.find((lesson) => lesson.id === id);
    if (!current) return;
    let items = current.preparation || [];
    if (action.kind === "add") {
      if (!action.text.trim()) return;
      items = [
        ...items,
        { id: crypto.randomUUID(), text: action.text.trim(), done: false },
      ];
    } else if (action.kind === "remove")
      items = items.filter((item) => item.id !== action.id);
    else
      items = items.map((item) =>
        item.id === action.id ? { ...item, done: action.done } : item,
      );
    if (
      await save({
        ...snapshot.data,
        lessons: snapshot.data.lessons.map((lesson) =>
          lesson.id === id
            ? {
                ...lesson,
                preparation: items,
                updatedAt: new Date().toISOString(),
              }
            : lesson,
        ),
      })
    ) {
      if (action.kind === "add") setQuickDraft(id, { preparation: "" });
    }
  }
  async function saveSlot(slot: TimetableSlot) {
    if (!snapshot || saving.current || conflict) return;
    const slots = snapshot.data.timetable || [];
    const timetable = slots.some((s) => s.id === slot.id)
      ? slots.map((s) => (s.id === slot.id ? slot : s))
      : [...slots, slot];
    if (await save({ ...snapshot.data, timetable })) setSlotDraft(null);
  }
  async function deleteSlot(id: string) {
    if (!snapshot || saving.current || conflict) return;
    await save({
      ...snapshot.data,
      timetable: (snapshot.data.timetable || []).filter((s) => s.id !== id),
    });
  }
  async function registerWeek(selected: string[]) {
    if (
      !snapshot ||
      saving.current ||
      conflict ||
      slotDraft ||
      schoolSync.loading
    )
      return;
    const candidates = weekCandidates(
      snapshot.data.timetable || [],
      timetableWeek,
      snapshot.data.lessons,
      schoolSync.events,
    );
    const additions = lessonsFromWeek(candidates, selected);
    if (!additions.length) return;
    if (
      await save({
        ...snapshot.data,
        lessons: [...snapshot.data.lessons, ...additions],
      })
    )
      setNotice(
        `${additions.length}개 수업을 등록했습니다. 달력에서 각 수업의 제목·날짜·내용을 수정할 수 있어요.`,
      );
  }
  async function reload() {
    if (
      dirty &&
      !confirm(
        "편집 중인 내용이 사라집니다. 필요하면 먼저 초안을 내려받아 주세요. 최신 내용을 불러올까요?",
      )
    )
      return;
    setEditor(null);
    setDirty(false);
    await load();
  }

  const data = snapshot?.data;
  const lessons = (data?.lessons || [])
    .filter(
      (l) =>
        (!subject || l.subject === subject) &&
        (!grade || String(l.grade) === grade) &&
        (!classroom || l.classroom === classroom) &&
        (!search ||
          `${l.title} ${lessonItem(l, "").content}`
            .toLowerCase()
            .includes(search.toLowerCase())),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.period ?? 99) - (b.period ?? 99) ||
        a.grade - b.grade ||
        a.classroom.localeCompare(b.classroom, "ko", { numeric: true }),
    );
  const overviewLessons =
    view === "today"
      ? lessons.filter((lesson) => lesson.date === today)
      : lessons;
  const units = (data?.units || []).filter(
    (u) =>
      (!subject || u.subject === subject) &&
      (!grade || String(u.grade) === grade) &&
      (!search ||
        `${u.title} ${unitItem(u, "").content}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const monthStart = anchor.slice(0, 7) + "-01";
  const start =
    calendarMode === "month"
      ? shiftDate(monthStart, -new Date(monthStart + "T00:00:00Z").getUTCDay())
      : shiftDate(anchor, -new Date(anchor + "T00:00:00Z").getUTCDay());
  const calendarDates = Array.from(
    { length: calendarMode === "month" ? 42 : 7 },
    (_, i) => shiftDate(start, i),
  );
  const allSubjects = [
    ...new Set([
      ...SUBJECTS,
      ...(data?.lessons.map((l) => l.subject) || []),
      ...(data?.units.map((u) => u.subject) || []),
    ]),
  ];
  const classes = [
    ...new Set(
      (data?.lessons || [])
        .filter((l) => !grade || String(l.grade) === grade)
        .map((l) => l.classroom),
    ),
  ].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  const lesson = editor?.kind === "lesson" ? editor.value : null;
  const unit = editor?.kind === "unit" ? editor.value : null;
  const selectedUnit = data?.units.find((u) => u.id === lesson?.unitId);
  const busyOrMissing = busy || loading || !snapshot;
  function moveCalendar(direction: number) {
    if (calendarMode === "week")
      return setAnchor(shiftDate(anchor, direction * 7));
    const date = new Date(monthStart + "T00:00:00Z");
    date.setUTCMonth(date.getUTCMonth() + direction);
    setAnchor(date.toISOString().slice(0, 10));
  }
  const errorBox = error && (
    <div className="error" role="alert">
      <span>{error}</span>
      {conflict && (
        <div className="inline-actions">
          {editor && (
            <button
              type="button"
              onClick={() => download(editor, `수업-미저장-초안-${today}.json`)}
            >
              <Download size={14} /> 초안 내려받기
            </button>
          )}
          <button type="button" onClick={() => void reload()}>
            최신 내용 불러오기
          </button>
        </div>
      )}
      {!conflict && (
        <button type="button" onClick={() => window.location.reload()}>
          페이지 새로고침
        </button>
      )}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <BookOpen size={22} />
          </span>
          <span>
            <strong>수업의 결</strong>
            <small>나의 수업 계획 공간</small>
          </span>
        </a>
        <div className="workspace-label">MY WORKSPACE</div>
        <nav aria-label="주요 메뉴">
          {(
            [
              { id: "today", label: "오늘의 수업", icon: Sun },
              { id: "calendar", label: "수업 달력", icon: CalendarDays },
              { id: "board", label: "준비상태 보드", icon: Columns3 },
              { id: "plans", label: "수업·단원 계획", icon: ListChecks },
              { id: "library", label: "수업 자료실", icon: BookOpen },
              { id: "timetable", label: "학교·기초시간표", icon: Settings2 },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => {
                if (
                  view !== "library" ||
                  !libraryDirty ||
                  confirm("저장하지 않은 자료 편집을 닫을까요?")
                )
                  setView(item.id);
              }}
            >
              <item.icon size={19} />
              {item.label}
              {view === item.id && <span className="active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>작은 기록이 모여</span>
          <strong>더 좋은 수업이 됩니다.</strong>
          <p>
            오늘의 반응을 남겨
            <br />
            다음 수업으로 이어가세요.
          </p>
          <BookOpen size={32} strokeWidth={1} />
        </div>
        <div className="profile">
          <span className="avatar">T</span>
          <div>
            <strong>선생님의 작업실</strong>
            <small>{login}</small>
          </div>
          {!demo && (
            <form action="/api/auth/logout" method="post">
              <button
                className="icon-button"
                title="로그아웃"
                aria-label="로그아웃"
              >
                <LogOut size={17} />
              </button>
            </form>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            나의 작업실 <span className="slash">/</span> {viewLabels[view]}
          </span>
          <span className="private-tag">
            <span /> PRIVATE WORKSPACE
          </span>
        </header>
        {demo && (
          <div className="demo-banner">
            로컬 데모 · 입력한 내용은 이 컴퓨터에만 저장됩니다. GitHub와
            연결되지 않은 검증용 모드입니다.
          </div>
        )}
        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">A LITTLE PLAN, A BETTER CLASS</span>
              <h1>
                {viewLabels[view]}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === "library"
                  ? "쌓아 둔 기록을 찾고, 필요한 부분을 다음 수업으로 이어가세요."
                  : view === "timetable"
                    ? "학교 일정을 확인하고, 기초시간표로 한 주의 수업을 준비하세요."
                    : view === "today"
                      ? "오늘 필요한 준비와 지난 메모를 살펴보고, 수업 후 짧게 기록하세요."
                      : view === "calendar"
                        ? "다가올 수업을 살펴보고, 나만의 속도로 준비해 보세요."
                        : view === "board"
                          ? "생각에서 준비로, 준비에서 수업으로. 한 걸음씩 이어가세요."
                          : "단원의 큰 그림을 그리고, 한 차시씩 구체화해 보세요."}
              </p>
            </div>
            <button
              className="button primary"
              disabled={busyOrMissing}
              onClick={() => beginLesson()}
            >
              <Plus size={18} /> 수업 계획 추가
            </button>
          </div>
          {view !== "timetable" && view !== "library" && (
            <>
              <section className="stats" aria-label="수업 현황">
                <Stat
                  label={view === "today" ? "오늘의 수업" : "등록한 수업"}
                  value={overviewLessons.length}
                  suffix="개"
                  detail={
                    view === "today"
                      ? today.replaceAll("-", ". ")
                      : "현재 필터 기준"
                  }
                />
                <Stat
                  label={view === "today" ? "수업 완료" : "오늘의 수업"}
                  value={
                    view === "today"
                      ? overviewLessons.filter((l) => l.status === "수업 완료")
                          .length
                      : lessons.filter((l) => l.date === today).length
                  }
                  suffix="개"
                  detail={today.replaceAll("-", ". ")}
                />
                <Stat
                  label="준비 중인 수업"
                  value={
                    overviewLessons.filter(
                      (l) =>
                        l.status === "계획 중" || l.status === "자료 준비 중",
                    ).length
                  }
                  suffix="개"
                  detail="차근차근 준비해요"
                />
                <Stat
                  label="준비 완료"
                  value={
                    overviewLessons.filter((l) => l.status === "준비 완료")
                      .length
                  }
                  suffix="개"
                  detail="수업을 기다리고 있어요"
                />
              </section>
              <div className="filter-bar">
                <div className="filters">
                  <select
                    aria-label="교과 필터"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  >
                    <option value="">모든 교과</option>
                    {allSubjects.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <select
                    aria-label="학년 필터"
                    value={grade}
                    onChange={(e) => {
                      setGrade(e.target.value);
                      setClassroom("");
                    }}
                  >
                    <option value="">모든 학년</option>
                    {[1, 2, 3, 4, 5, 6].map((g) => (
                      <option key={g} value={g}>
                        {g}학년
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="학반 필터"
                    value={classroom}
                    onChange={(e) => setClassroom(e.target.value)}
                    disabled={view === "plans" && planTab === "units"}
                  >
                    <option value="">모든 학반</option>
                    {classes.map((c) => (
                      <option key={c} value={c}>
                        {c}반
                      </option>
                    ))}
                  </select>
                  <input
                    className="search"
                    aria-label="계획 검색"
                    placeholder="계획 검색…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  className="icon-button"
                  aria-label="최신 내용 불러오기"
                  title="Codex에서 수정한 내용 불러오기"
                  disabled={busyOrMissing}
                  onClick={() => void reload()}
                >
                  <RefreshCw size={17} className={loading ? "spin" : ""} />
                </button>
              </div>
            </>
          )}
          {view === "timetable" && (
            <div className="timetable-reload">
              <button
                className="button"
                disabled={busyOrMissing}
                onClick={() => void reload()}
              >
                <RefreshCw size={17} /> 최신 내용 불러오기
              </button>
              <span>다른 기기에서 저장한 시간표와 수업을 불러옵니다.</span>
            </div>
          )}
          {slotDraft && view !== "timetable" && (
            <div className="quick-draft-notice">
              <span>저장하지 않은 기초시간표 편집 내용이 있어요.</span>
              <button className="button" onClick={() => setView("timetable")}>
                시간표 편집 이어가기
              </button>
            </div>
          )}
          {hasQuickDrafts && (
            <div className="quick-draft-notice">
              <span>
                저장하지 않은 빠른 기록이 있어요. 화면 이동·최신 내용 불러오기
                후에도 초안은 유지됩니다.
              </span>
              <button
                className="button"
                onClick={() =>
                  download(
                    {
                      drafts: quickDrafts,
                      lessons: data?.lessons.filter(
                        (lesson) => quickDrafts[lesson.id],
                      ),
                    },
                    `빠른기록-미저장-초안-${today}.json`,
                  )
                }
              >
                <Download size={16} /> 초안 내려받기
              </button>
            </div>
          )}
          {!editor && errorBox}
          {deletedLesson && (
            <div className="notice calendar-undo" role="status">
              <span>
                ‘{deletedLesson.lesson.title}’ 삭제됨 · 15초 동안 되돌릴 수
                있어요.
              </span>
              <button
                className="button"
                disabled={busy || conflict || loading}
                onClick={() => void undoCalendarDelete()}
              >
                삭제 실행 취소
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <Check size={15} />
              {notice}
            </div>
          )}
          {loading ? (
            <div className="empty-state">수업 계획을 불러오고 있어요…</div>
          ) : !snapshot ? (
            <div className="empty-state">
              <BookOpen />
              <h2>계획을 불러오지 못했어요</h2>
              <p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
              <button className="button" onClick={() => void load()}>
                다시 불러오기
              </button>
            </div>
          ) : (
            <>
              {["today", "calendar", "timetable"].includes(view) && (
                <SchoolSyncBar
                  sync={schoolSync}
                  visible={showSchoolEvents}
                  onToggle={() => setShowSchoolEvents((value) => !value)}
                />
              )}
              {view === "library" && (
                <TeachingLibrary
                  lessons={snapshot.data.lessons}
                  onReuse={reuseLibrary}
                  onDirty={setLibraryDirty}
                  backend={snapshot.backend}
                />
              )}
              {view === "timetable" && (
                <TimetableSettings
                  data={snapshot.data}
                  week={timetableWeek}
                  onWeek={setTimetableWeek}
                  sync={schoolSync}
                  blocked={busyOrMissing || conflict}
                  busy={busy}
                  draft={slotDraft}
                  onDraft={setSlotDraft}
                  onSaveSlot={saveSlot}
                  onDeleteSlot={deleteSlot}
                  onRegister={registerWeek}
                  onCalendar={() => {
                    setAnchor(timetableWeek);
                    setCalendarMode("week");
                    setView("calendar");
                  }}
                />
              )}
              {view === "today" && showSchoolEvents && (
                <div className="today-school-events">
                  <SchoolEventList
                    events={eventsFor(
                      schoolSync.events,
                      today,
                      grade ? Number(grade) : undefined,
                    )}
                  />
                </div>
              )}
              {view === "today" && (
                <TodayDashboard
                  today={today}
                  lessons={lessons}
                  allLessons={data?.lessons || []}
                  drafts={quickDrafts}
                  blocked={busyOrMissing || conflict}
                  busy={busy}
                  filtered={!!(subject || grade || classroom || search)}
                  onDraft={setQuickDraft}
                  onRecord={recordQuickly}
                  onPreparation={updatePreparation}
                  onStatus={changeStatus}
                  onOpen={(value) =>
                    open({ kind: "lesson", value, fresh: false })
                  }
                  onCalendar={() => {
                    setAnchor(today);
                    setView("calendar");
                  }}
                  onAdd={() => beginLesson()}
                  onClearFilters={() => {
                    setSubject("");
                    setGrade("");
                    setClassroom("");
                    setSearch("");
                  }}
                />
              )}
              {view === "calendar" && (
                <section className="calendar-panel">
                  <div className="calendar-toolbar">
                    <div className="calendar-title">
                      <h2>
                        {Number(anchor.slice(0, 4))}년{" "}
                        <strong>{Number(anchor.slice(5, 7))}월</strong>
                      </h2>
                      <button
                        className="icon-button"
                        aria-label="이전 기간"
                        onClick={() => moveCalendar(-1)}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="다음 기간"
                        onClick={() => moveCalendar(1)}
                      >
                        <ChevronRight size={18} />
                      </button>
                      <button
                        className="today-button"
                        onClick={() => setAnchor(today)}
                      >
                        오늘
                      </button>
                    </div>
                    <div className="segmented" aria-label="달력 보기">
                      <button
                        aria-pressed={calendarMode === "month"}
                        className={calendarMode === "month" ? "selected" : ""}
                        onClick={() => setCalendarMode("month")}
                      >
                        월간
                      </button>
                      <button
                        aria-pressed={calendarMode === "week"}
                        className={calendarMode === "week" ? "selected" : ""}
                        onClick={() => setCalendarMode("week")}
                      >
                        주간
                      </button>
                    </div>
                  </div>
                  <div className="calendar-batch-action">
                    <button
                      className="button"
                      disabled={busyOrMissing}
                      onClick={() => {
                        setTimetableWeek(anchor);
                        setView("timetable");
                      }}
                    >
                      시간표로 주간 등록
                    </button>
                    <span>기초시간표에서 필요한 수업을 선택해 등록하세요.</span>
                  </div>
                  <div className="calendar-grid weekdays">
                    {weekdays.map((day, i) => (
                      <div
                        key={day}
                        className={
                          i === 0 ? "sunday" : i === 6 ? "saturday" : ""
                        }
                      >
                        {day}
                      </div>
                    ))}
                  </div>
                  <div
                    className={`calendar-grid dates ${calendarMode === "week" ? "week-mode" : ""}`}
                  >
                    {calendarDates.map((date, idx) => (
                      <div
                        key={date}
                        data-date={date}
                        onContextMenu={(e) => showCalendarMenu(e, date)}
                        className={`day-cell ${date.slice(0, 7) !== anchor.slice(0, 7) ? "outside" : ""} ${date === today ? "is-today" : ""}`}
                      >
                        <div className="day-heading">
                          <span
                            className={`date-number ${idx % 7 === 0 ? "sunday" : idx % 7 === 6 ? "saturday" : ""}`}
                          >
                            {Number(date.slice(8))}
                          </span>
                          <div className="day-actions">
                            <button
                              className="calendar-more"
                              aria-label={`${date} 날짜 메뉴`}
                              aria-haspopup="menu"
                              aria-expanded={
                                calendarMenu?.date === date &&
                                !calendarMenu.lessonId
                              }
                              disabled={busyOrMissing || conflict}
                              onClick={(e) =>
                                showCalendarMenu(e, date, undefined, true)
                              }
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            <button
                              className="add-day"
                              disabled={busy}
                              aria-label={`${date} 수업 추가`}
                              onClick={() => beginLesson(date)}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                        {showSchoolEvents && (
                          <SchoolEventList
                            events={eventsFor(
                              schoolSync.events,
                              date,
                              grade ? Number(grade) : undefined,
                            )}
                          />
                        )}
                        {lessons
                          .filter((l) => l.date === date)
                          .map((l) => (
                            <div
                              className="calendar-event-wrap"
                              key={l.id}
                              onContextMenu={(e) =>
                                showCalendarMenu(e, date, l.id)
                              }
                            >
                              <button
                                className={`calendar-event ${l.status === "수업 완료" ? "completed" : ""}`}
                                style={
                                  {
                                    "--subject-color": color(l.subject),
                                  } as React.CSSProperties
                                }
                                disabled={busyOrMissing}
                                onKeyDown={(e) => {
                                  if (
                                    e.key === "ContextMenu" ||
                                    (e.shiftKey && e.key === "F10")
                                  ) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (busyOrMissing || conflict) return;
                                    const rect =
                                      e.currentTarget.getBoundingClientRect();
                                    setCalendarMenu({
                                      date,
                                      lessonId: l.id,
                                      trigger: e.currentTarget,
                                      x: rect.left,
                                      y: rect.bottom,
                                    });
                                  }
                                }}
                                onClick={() =>
                                  open({
                                    kind: "lesson",
                                    value: l,
                                    fresh: false,
                                  })
                                }
                              >
                                <span className="event-meta">
                                  {l.subject} · {l.grade}-{l.classroom}
                                  {l.period ? ` · ${l.period}교시` : ""}
                                  {l.status === "준비 완료" && (
                                    <Check size={12} />
                                  )}
                                </span>
                                <strong>{l.title}</strong>
                              </button>
                              <button
                                className="calendar-more lesson-more"
                                aria-label={`${l.title} ${l.grade}-${l.classroom} 수업 메뉴`}
                                aria-haspopup="menu"
                                aria-expanded={calendarMenu?.lessonId === l.id}
                                disabled={busyOrMissing || conflict}
                                onClick={(e) =>
                                  showCalendarMenu(e, date, l.id, true)
                                }
                              >
                                <MoreHorizontal size={16} />
                              </button>
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                  <footer className="calendar-footer">
                    <span>
                      수업·날짜를 우클릭하거나 ⋯ 버튼을 눌러 빠르게 정리하세요.
                    </span>
                    <div>
                      {[...new Set(lessons.map((l) => l.subject))]
                        .slice(0, 7)
                        .map((s) => (
                          <span key={s}>
                            <i style={{ background: color(s) }} />
                            {s}
                          </span>
                        ))}
                    </div>
                  </footer>
                </section>
              )}
              {view === "board" && (
                <>
                  <p className="view-hint">
                    카드를 옮기거나 카드의 상태를 선택해 준비상태를 바꿀 수
                    있어요.
                  </p>
                  <section className="board">
                    {STATUSES.map((status, index) => (
                      <div
                        key={status}
                        className={`board-column status-${index}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          void changeStatus(
                            e.dataTransfer.getData("text/plain"),
                            status,
                          );
                        }}
                      >
                        <h2>
                          <span className="status-dot" />
                          {status}
                          <span className="count">
                            {lessons.filter((l) => l.status === status).length}
                          </span>
                        </h2>
                        <div className="board-cards">
                          {lessons
                            .filter((l) => l.status === status)
                            .map((l) => (
                              <article
                                key={l.id}
                                className="lesson-card"
                                draggable={!busy && !conflict}
                                onDragStart={(e) =>
                                  e.dataTransfer.setData("text/plain", l.id)
                                }
                              >
                                <button
                                  className="card-open"
                                  onClick={() =>
                                    open({
                                      kind: "lesson",
                                      value: l,
                                      fresh: false,
                                    })
                                  }
                                >
                                  <span
                                    className="subject-tag"
                                    style={{ color: color(l.subject) }}
                                  >
                                    {l.subject}
                                  </span>
                                  <h3>{l.title}</h3>
                                  <p>
                                    {l.grade}학년 {l.classroom}반 ·{" "}
                                    {l.date.slice(5).replace("-", ". ")}
                                  </p>
                                  <span className="due">
                                    {dueLabel(l.date, today)}
                                  </span>
                                </button>
                                <select
                                  aria-label={`${l.title} 준비상태`}
                                  value={l.status}
                                  disabled={busy || conflict}
                                  onChange={(e) =>
                                    void changeStatus(
                                      l.id,
                                      e.target.value as Lesson["status"],
                                    )
                                  }
                                >
                                  {STATUSES.map((s) => (
                                    <option key={s}>{s}</option>
                                  ))}
                                </select>
                              </article>
                            ))}
                          {!lessons.some((l) => l.status === status) && (
                            <p className="column-empty">아직 수업이 없어요.</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </section>
                </>
              )}
              {view === "plans" && (
                <section className="plans-panel">
                  <div className="plans-toolbar">
                    <div className="tabs">
                      <button
                        className={planTab === "units" ? "active" : ""}
                        onClick={() => setPlanTab("units")}
                      >
                        단원 지도 계획 <span>{units.length}</span>
                      </button>
                      <button
                        className={planTab === "lessons" ? "active" : ""}
                        onClick={() => setPlanTab("lessons")}
                      >
                        수업 계획 <span>{lessons.length}</span>
                      </button>
                    </div>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        const value = newUnit();
                        if (subject) value.subject = subject;
                        if (grade) value.grade = Number(grade);
                        open({ kind: "unit", value, fresh: true });
                      }}
                    >
                      <Plus size={16} /> 단원 추가
                    </button>
                  </div>
                  {planTab === "units" ? (
                    <div className="unit-grid">
                      {units.map((u) => (
                        <article className="unit-card" key={u.id}>
                          <div className="unit-card-heading">
                            <span
                              className="subject-tag"
                              style={{ color: color(u.subject) }}
                            >
                              {u.grade}학년 · {u.subject}
                            </span>
                            <button
                              className="icon-button"
                              aria-label={`${u.title} 단원 수정`}
                              onClick={() =>
                                open({ kind: "unit", value: u, fresh: false })
                              }
                            >
                              <ArrowUpRight size={19} />
                            </button>
                          </div>
                          <h3>{u.title}</h3>
                          <p className="unit-achievement">
                            {u.achievement ||
                              "성취 수준을 자유롭게 기록해 보세요."}
                          </p>
                          <div className="unit-sessions">
                            {u.sessions.map((s, i) => (
                              <div key={s.id}>
                                <span>{i + 1}차시</span>
                                <p>{s.activity || "활동 내용 미정"}</p>
                                <button
                                  className="icon-button"
                                  title="이 차시로 수업 만들기"
                                  aria-label={`${u.title} ${i + 1}차시 수업 만들기`}
                                  disabled={busy}
                                  onClick={() => beginLesson(today, u, s.id)}
                                >
                                  <Plus size={15} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <footer>
                            {u.sessions.length}차시{" "}
                            <span>
                              연결된 수업{" "}
                              {
                                data!.lessons.filter((l) => l.unitId === u.id)
                                  .length
                              }
                              개
                            </span>
                          </footer>
                        </article>
                      ))}
                      {units.length === 0 && (
                        <Empty
                          title="첫 단원의 큰 그림을 그려보세요"
                          description="단원과 차시별 활동을 정리한 다음, 학급별 수업으로 이어갈 수 있어요."
                          action="단원 계획 만들기"
                          onClick={() =>
                            open({
                              kind: "unit",
                              value: newUnit(),
                              fresh: true,
                            })
                          }
                        />
                      )}
                    </div>
                  ) : lessons.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>수업</th>
                            <th>학급</th>
                            <th>날짜</th>
                            <th>준비상태</th>
                            <th>남은 일 수</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lessons.map((l) => (
                            <tr key={l.id}>
                              <td>
                                <button
                                  className="table-title"
                                  onClick={() =>
                                    open({
                                      kind: "lesson",
                                      value: l,
                                      fresh: false,
                                    })
                                  }
                                >
                                  <span style={{ color: color(l.subject) }}>
                                    {l.subject}
                                  </span>
                                  {l.title}
                                </button>
                              </td>
                              <td>
                                {l.grade}학년 {l.classroom}반
                              </td>
                              <td>{l.date}</td>
                              <td>
                                <span
                                  className={`status-pill status-${STATUSES.indexOf(l.status)}`}
                                >
                                  {l.status}
                                </span>
                              </td>
                              <td>{dueLabel(l.date, today)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title="아직 등록된 수업이 없어요"
                      description="새 수업을 추가하거나 단원의 차시에서 수업을 만들어 보세요."
                      action="수업 계획 만들기"
                      onClick={() => beginLesson()}
                    />
                  )}
                </section>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              수업의 결 ·{" "}
              {snapshot?.backend === "database"
                ? "클라우드 DB 저장"
                : demo
                  ? "로컬 데모"
                  : "GitHub 저장"}
            </span>
            <button
              disabled={!snapshot}
              onClick={() =>
                snapshot && download(snapshot.data, `수업계획-${today}.json`)
              }
            >
              <Download size={14} /> 전체 기록 내려받기
            </button>
          </footer>
        </main>
      </div>
      {calendarMenu && view === "calendar" && !editor && (
        <CalendarMenu
          target={calendarMenu}
          title={
            snapshot?.data.lessons.find((l) => l.id === calendarMenu.lessonId)
              ?.title || calendarMenu.date
          }
          canPaste={Boolean(copiedLesson)}
          onClose={closeCalendarMenu}
          onAction={calendarAction}
        />
      )}
      <dialog
        ref={dialog}
        className="editor-dialog"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        aria-labelledby="editor-title"
      >
        {editor && (
          <form onSubmit={submitEditor}>
            <header className="editor-header">
              <div>
                <span className="eyebrow">
                  {editor.kind === "lesson" ? "LESSON DETAILS" : "UNIT PLAN"}
                </span>
                <h2 id="editor-title">
                  {editor.kind === "lesson"
                    ? "수업 계획 세부사항"
                    : "단원 지도 계획"}
                </h2>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="편집 닫기"
                onClick={close}
                disabled={busy}
              >
                <X />
              </button>
            </header>
            <div className="editor-body">
              {errorBox}
              {editor.fresh && (
                <p className="form-note">
                  새로운 {editor.kind === "lesson" ? "수업" : "단원"}{" "}
                  계획이에요. * 항목을 입력한 뒤 저장해 주세요.
                </p>
              )}
              <fieldset disabled={busy}>
                <div className="form-grid">
                  <Field label="교과 *">
                    <input
                      required
                      maxLength={160}
                      list="subject-options"
                      value={editor.value.subject}
                      onChange={(e) =>
                        lesson
                          ? editLesson({
                              subject: e.target.value,
                              unitId: null,
                              sessionId: null,
                            })
                          : editUnit({ subject: e.target.value })
                      }
                    />
                    <datalist id="subject-options">
                      {allSubjects.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="학년 *">
                    <select
                      value={editor.value.grade}
                      onChange={(e) =>
                        lesson
                          ? editLesson({
                              grade: Number(e.target.value),
                              unitId: null,
                              sessionId: null,
                            })
                          : editUnit({ grade: Number(e.target.value) })
                      }
                    >
                      {[1, 2, 3, 4, 5, 6].map((g) => (
                        <option key={g} value={g}>
                          {g}학년
                        </option>
                      ))}
                    </select>
                  </Field>
                  {lesson && (
                    <>
                      <Field label="날짜 *">
                        <input
                          required
                          type="date"
                          value={lesson.date}
                          onChange={(e) => editLesson({ date: e.target.value })}
                        />
                      </Field>
                      <Field label="교시 (선택)">
                        <select
                          value={lesson.period || ""}
                          onChange={(e) =>
                            editLesson({
                              period: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            })
                          }
                        >
                          <option value="">교시 미지정</option>
                          {Array.from({ length: 12 }, (_, i) => (
                            <option key={i} value={i + 1}>
                              {i + 1}교시
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="학반 *">
                        <div className="input-suffix">
                          <input
                            required
                            maxLength={40}
                            value={lesson.classroom}
                            onChange={(e) =>
                              editLesson({ classroom: e.target.value })
                            }
                          />
                          <span aria-hidden="true">반</span>
                        </div>
                      </Field>
                    </>
                  )}
                  <Field label={lesson ? "수업제목 *" : "단원명 *"} wide>
                    <input
                      required
                      maxLength={160}
                      placeholder={
                        lesson
                          ? "어떤 수업을 계획하고 있나요?"
                          : "이번 단원의 이름을 적어주세요"
                      }
                      value={editor.value.title}
                      onChange={(e) =>
                        lesson
                          ? editLesson({ title: e.target.value })
                          : editUnit({ title: e.target.value })
                      }
                    />
                  </Field>
                  {lesson && (
                    <>
                      <Field label="준비상태">
                        <select
                          value={lesson.status}
                          onChange={(e) =>
                            editLesson({
                              status: e.target.value as Lesson["status"],
                            })
                          }
                        >
                          {STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="수업까지 남은 일 수">
                        <div className="read-only">
                          {lesson.date
                            ? dueLabel(lesson.date, today)
                            : "날짜를 선택하세요"}
                          <small>한국 시간 기준 · 자동 계산</small>
                        </div>
                      </Field>
                      <Field label="연결할 단원">
                        <select
                          value={lesson.unitId || ""}
                          onChange={(e) =>
                            editLesson({
                              unitId: e.target.value || null,
                              sessionId: null,
                            })
                          }
                        >
                          <option value="">단원 없이 작성</option>
                          {data?.units
                            .filter(
                              (u) =>
                                u.grade === lesson.grade &&
                                u.subject === lesson.subject,
                            )
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.title}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="단원 차시">
                        <select
                          disabled={!selectedUnit}
                          value={lesson.sessionId || ""}
                          onChange={(e) =>
                            editLesson({ sessionId: e.target.value || null })
                          }
                        >
                          <option value="">차시 미지정</option>
                          {selectedUnit?.sessions.map((s, i) => (
                            <option key={s.id} value={s.id}>
                              {i + 1}차시
                            </option>
                          ))}
                        </select>
                      </Field>
                      <TextField
                        label="학습목표"
                        value={lesson.objective}
                        onChange={(objective) => editLesson({ objective })}
                        placeholder="수업을 통해 학생들이 배우게 될 내용을 적어주세요."
                      />
                      <TextField
                        label="교재"
                        value={lesson.materials}
                        onChange={(materials) => editLesson({ materials })}
                        placeholder="교과서 쪽수, 활동지, 준비물, 참고 링크 등"
                      />
                      <section
                        className="wide preparation-editor"
                        aria-label="준비 체크 편집"
                      >
                        <h3>준비 체크</h3>
                        <ul className="today-checklist">
                          {(lesson.preparation || []).map((item, index) => (
                            <li key={item.id}>
                              <div className="preparation-edit-row">
                                <input
                                  type="checkbox"
                                  checked={item.done}
                                  aria-label={`준비 항목 ${index + 1} 완료`}
                                  onChange={(event) =>
                                    editLesson({
                                      preparation: lesson.preparation!.map(
                                        (entry) =>
                                          entry.id === item.id
                                            ? {
                                                ...entry,
                                                done: event.target.checked,
                                              }
                                            : entry,
                                      ),
                                    })
                                  }
                                />
                                <input
                                  type="text"
                                  required
                                  maxLength={300}
                                  value={item.text}
                                  aria-label={`준비 항목 ${index + 1} 내용`}
                                  onChange={(event) =>
                                    editLesson({
                                      preparation: lesson.preparation!.map(
                                        (entry) =>
                                          entry.id === item.id
                                            ? {
                                                ...entry,
                                                text: event.target.value,
                                              }
                                            : entry,
                                      ),
                                    })
                                  }
                                />
                              </div>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`준비 항목 ${index + 1} 삭제`}
                                onClick={() =>
                                  editLesson({
                                    preparation: lesson.preparation!.filter(
                                      (entry) => entry.id !== item.id,
                                    ),
                                  })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          className="button"
                          disabled={(lesson.preparation?.length || 0) >= 100}
                          onClick={() =>
                            editLesson({
                              preparation: [
                                ...(lesson.preparation || []),
                                {
                                  id: crypto.randomUUID(),
                                  text: "",
                                  done: false,
                                },
                              ],
                            })
                          }
                        >
                          <Plus size={16} /> 준비 항목 추가
                        </button>
                      </section>
                      <TextField
                        label="활동"
                        value={lesson.activities}
                        onChange={(activities) => editLesson({ activities })}
                        placeholder="도입부터 정리까지, 수업의 흐름을 자유롭게 적어주세요."
                        rows={5}
                      />
                      <TextField
                        label="학생피드백"
                        value={lesson.feedback}
                        onChange={(feedback) => editLesson({ feedback })}
                        placeholder="학생들이 보인 반응과 다음 수업에 참고할 점을 남겨주세요."
                      />
                      <TextField
                        label="참고사항"
                        value={lesson.notes}
                        onChange={(notes) => editLesson({ notes })}
                      />
                    </>
                  )}
                  {unit && (
                    <>
                      <TextField
                        label="성취 수준"
                        value={unit.achievement}
                        onChange={(achievement) => editUnit({ achievement })}
                        placeholder="교육과정 성취기준과 학생의 도달 수준을 연결해 자유롭게 작성해 주세요."
                        rows={4}
                      />
                      <div className="wide session-editor">
                        <div className="section-heading">
                          <h3>차시별 활동내용</h3>
                          <span>{unit.sessions.length}차시</span>
                        </div>
                        {unit.sessions.map((s, i) => {
                          const linked = data?.lessons.some(
                            (l) => l.unitId === unit.id && l.sessionId === s.id,
                          );
                          return (
                            <div className="session-row" key={s.id}>
                              <label htmlFor={`session-${s.id}`}>
                                {i + 1}차시
                              </label>
                              <textarea
                                id={`session-${s.id}`}
                                rows={2}
                                maxLength={20000}
                                value={s.activity}
                                placeholder="이 차시의 활동을 적어주세요"
                                onChange={(e) =>
                                  editUnit({
                                    sessions: unit.sessions.map((x) =>
                                      x.id === s.id
                                        ? { ...x, activity: e.target.value }
                                        : x,
                                    ),
                                  })
                                }
                              />
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`${i + 1}차시 삭제`}
                                title={
                                  linked
                                    ? "연결된 수업에서 차시 연결을 먼저 해제해 주세요"
                                    : "차시 삭제"
                                }
                                disabled={unit.sessions.length <= 1 || linked}
                                onClick={() => {
                                  if (
                                    !s.activity ||
                                    confirm("이 차시의 활동내용을 삭제할까요?")
                                  )
                                    editUnit({
                                      sessions: unit.sessions.filter(
                                        (x) => x.id !== s.id,
                                      ),
                                    });
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          className="button add-session"
                          disabled={unit.sessions.length >= 100}
                          onClick={() =>
                            editUnit({
                              sessions: [
                                ...unit.sessions,
                                { id: crypto.randomUUID(), activity: "" },
                              ],
                            })
                          }
                        >
                          <Plus size={16} /> 차시 추가
                        </button>
                      </div>
                      <TextField
                        label="기본설계"
                        value={unit.design}
                        onChange={(design) => editUnit({ design })}
                        placeholder="필요한 경우에만 작성해 주세요."
                      />
                      <TextField
                        label="비고"
                        value={unit.notes}
                        onChange={(notes) => editUnit({ notes })}
                      />
                    </>
                  )}
                  {lesson &&
                    lesson.references &&
                    lesson.references.length > 0 && (
                      <details className="wide">
                        <summary>
                          참고·가져온 자료 ({lesson.references.length})
                        </summary>
                        {lesson.references.map((r, i) => (
                          <div key={i}>
                            <a
                              href={`/?libraryId=${r.sourceId}&version=${r.version}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {r.title} · 참조 당시 원문
                            </a>
                            <pre className="library-content">{r.excerpt}</pre>
                            <button
                              type="button"
                              className="button"
                              onClick={() =>
                                editLesson({
                                  references: lesson.references!.filter(
                                    (_, j) => j !== i,
                                  ),
                                })
                              }
                            >
                              이 참조 연결 해제
                            </button>
                          </div>
                        ))}
                      </details>
                    )}
                  <div className="recorded wide">
                    기록한 날짜{" "}
                    {new Intl.DateTimeFormat("ko-KR", {
                      timeZone: "Asia/Seoul",
                      dateStyle: "long",
                    }).format(new Date(editor.value.createdAt))}
                    <span>최초 작성일은 수정해도 유지됩니다.</span>
                  </div>
                </div>
              </fieldset>
            </div>
            <footer className="editor-footer">
              <div>
                {!editor.fresh && (
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label="계획 삭제"
                    disabled={busy || conflict}
                    onClick={() => void removeEditor()}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                {lesson && (
                  <button
                    type="button"
                    className="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        dirty &&
                        !confirm(
                          "현재 편집 내용을 복사해 새 수업을 만들까요? 원본에는 저장되지 않습니다.",
                        )
                      )
                        return;
                      const value = copyLesson(lesson);
                      value.classroom = "";
                      open({ kind: "lesson", value, fresh: true });
                      setDirty(true);
                    }}
                  >
                    <Copy size={16} /> 다른 학반에 복제
                  </button>
                )}
              </div>
              <button className="button primary" disabled={busy || conflict}>
                {busy ? "저장 중…" : "계획 저장"}
                <Check size={17} />
              </button>
            </footer>
          </form>
        )}
      </dialog>
    </div>
  );
}

function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  function connect(nodes: React.ReactNode): React.ReactNode {
    return Children.map(nodes, (node) => {
      if (!isValidElement<{ id?: string; children?: React.ReactNode }>(node))
        return node;
      if (["input", "select", "textarea"].includes(node.type as string))
        return cloneElement(node, { id });
      if (node.type === "div")
        return cloneElement(node, { children: connect(node.props.children) });
      return node;
    });
  }
  return (
    <div className={`field ${wide ? "wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {connect(children)}
    </div>
  );
}
function TextField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <Field label={label} wide>
      <textarea
        aria-label={label}
        maxLength={20000}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
function Stat({
  label,
  value,
  suffix,
  detail,
}: {
  label: string;
  value: number;
  suffix: string;
  detail: string;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>
        {value}
        <small>{suffix}</small>
      </strong>
      <p>{detail}</p>
    </div>
  );
}
function Empty({
  title,
  description,
  action,
  onClick,
}: {
  title: string;
  description: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="empty-state">
      <Layers3 size={34} strokeWidth={1.3} />
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="button" onClick={onClick}>
        <Plus size={16} />
        {action}
      </button>
    </div>
  );
}
