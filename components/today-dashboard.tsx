"use client";

import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";
import { STATUSES, SUBJECT_COLORS, type Lesson } from "@/lib/planner";
import { previousLesson, resourceLinks } from "@/lib/today";

export type QuickDraft = { note: string; preparation: string };
export type PreparationAction =
  | { kind: "add"; text: string }
  | { kind: "toggle"; id: string; done: boolean }
  | { kind: "remove"; id: string };

type Props = {
  today: string;
  lessons: Lesson[];
  allLessons: Lesson[];
  drafts: Record<string, QuickDraft>;
  blocked: boolean;
  busy: boolean;
  filtered: boolean;
  onDraft: (id: string, patch: Partial<QuickDraft>) => void;
  onRecord: (id: string, complete: boolean) => Promise<void>;
  onPreparation: (id: string, action: PreparationAction) => Promise<void>;
  onStatus: (id: string, status: Lesson["status"]) => Promise<void>;
  onOpen: (lesson: Lesson) => void;
  onCalendar: () => void;
  onAdd: () => void;
  onClearFilters: () => void;
};

export default function TodayDashboard(props: Props) {
  const lessons = props.lessons.filter((lesson) => lesson.date === props.today);
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeZone: "Asia/Seoul",
  }).format(new Date(props.today + "T00:00:00+09:00"));
  const completed = lessons.filter(
    (lesson) => lesson.status === "수업 완료",
  ).length;
  return (
    <section className="today-dashboard" aria-label="오늘 수업 모아보기">
      <div className="today-overview">
        <div>
          <span className="eyebrow">TODAY AT A GLANCE</span>
          <h2>{dateLabel}</h2>
          <p>수업 준비부터 짧은 기록까지, 이곳에서 이어가세요.</p>
        </div>
        <div className="today-overview-actions">
          <span>
            {completed} / {lessons.length} 수업 완료
          </span>
          <button className="button" onClick={props.onCalendar}>
            <CalendarDays size={18} /> 달력에서 보기
          </button>
        </div>
      </div>
      {lessons.length === 0 ? (
        <div className="today-empty">
          <BookOpen size={32} />
          <h2>
            {props.filtered
              ? "조건에 맞는 오늘 수업이 없어요"
              : "오늘 등록된 수업이 없어요"}
          </h2>
          <p>
            {props.filtered
              ? "필터를 해제하거나 달력에서 다른 날짜를 살펴보세요."
              : "새 수업을 추가하거나 달력에서 다음 수업을 준비해 보세요."}
          </p>
          <div className="today-actions">
            {props.filtered && (
              <button className="button" onClick={props.onClearFilters}>
                필터 해제
              </button>
            )}
            <button
              className="button primary"
              onClick={props.onAdd}
              disabled={props.blocked}
            >
              <Plus size={18} /> 오늘 수업 추가
            </button>
          </div>
        </div>
      ) : (
        <div className="today-cards">
          {lessons.map((lesson) => (
            <TodayLessonCard
              key={lesson.id}
              {...props}
              lesson={lesson}
              previous={previousLesson(lesson, props.allLessons)}
              draft={props.drafts[lesson.id] || { note: "", preparation: "" }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TodayLessonCard({
  lesson,
  previous,
  draft,
  ...props
}: Props & { lesson: Lesson; previous?: Lesson; draft: QuickDraft }) {
  const items = lesson.preparation || [];
  const links = resourceLinks(`${lesson.materials}\n${lesson.activities}`);
  const completed = lesson.status === "수업 완료";
  return (
    <article
      className="today-card"
      aria-labelledby={`today-title-${lesson.id}`}
    >
      <header className="today-card-header">
        <div>
          <span
            className="subject-tag"
            style={{ color: SUBJECT_COLORS[lesson.subject] || "#b6c5dd" }}
          >
            {lesson.subject} · {lesson.grade}학년 {lesson.classroom}반
          </span>
          <h2 id={`today-title-${lesson.id}`}>{lesson.title}</h2>
          <span
            className={`status-pill status-${STATUSES.indexOf(lesson.status)}`}
          >
            {lesson.status}
          </span>
        </div>
        <button
          className="button"
          onClick={() => props.onOpen(lesson)}
          disabled={props.busy}
        >
          상세 편집 <ArrowUpRight size={18} />
        </button>
      </header>
      {(lesson.objective || lesson.activities) && (
        <details className="today-details">
          <summary>목표와 활동 보기</summary>
          {lesson.objective && (
            <p>
              <strong>학습목표</strong>
              {lesson.objective}
            </p>
          )}
          {lesson.activities && (
            <p>
              <strong>활동</strong>
              {lesson.activities}
            </p>
          )}
        </details>
      )}
      <div className="today-card-columns">
        <section className="today-preparation" aria-label="수업 준비">
          <h3>준비물 · 수업 자료</h3>
          <p className="today-materials">
            {lesson.materials ||
              "아직 등록한 준비물이나 자료가 없어요. 상세 편집에서 추가할 수 있어요."}
          </p>
          {links.length > 0 && (
            <div className="today-links">
              {links.map((link, index) => (
                <a
                  className="button"
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.href}
                  aria-label={`자료 ${index + 1}: ${link.label} (새 창)`}
                >
                  <ExternalLink size={16} />{" "}
                  {links.length > 1 ? `${index + 1}. ` : ""}
                  {link.label}
                </a>
              ))}
            </div>
          )}
          <div className="today-checklist-title">
            <h3>준비 체크</h3>
            <span>
              {items.filter((item) => item.done).length} / {items.length}
            </span>
          </div>
          {items.length === 0 && (
            <p className="today-hint">예: 활동지 인쇄, PPT 확인, 교구 준비</p>
          )}
          <ul className="today-checklist">
            {items.map((item) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.done}
                    disabled={props.blocked}
                    onChange={(event) =>
                      void props.onPreparation(lesson.id, {
                        kind: "toggle",
                        id: item.id,
                        done: event.target.checked,
                      })
                    }
                  />
                  <span className={item.done ? "checked" : ""}>
                    {item.text}
                  </span>
                </label>
                <button
                  className="icon-button"
                  disabled={props.blocked}
                  aria-label={`${item.text} 준비 항목 삭제`}
                  onClick={() =>
                    void props.onPreparation(lesson.id, {
                      kind: "remove",
                      id: item.id,
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="today-prep-add"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.preparation.trim())
                void props.onPreparation(lesson.id, {
                  kind: "add",
                  text: draft.preparation,
                });
            }}
          >
            <label className="sr-only" htmlFor={`prep-${lesson.id}`}>
              준비할 일
            </label>
            <input
              id={`prep-${lesson.id}`}
              value={draft.preparation}
              maxLength={300}
              disabled={props.busy}
              placeholder="준비할 일 추가"
              onChange={(event) =>
                props.onDraft(lesson.id, { preparation: event.target.value })
              }
            />
            <button
              className="button"
              disabled={
                props.blocked ||
                !draft.preparation.trim() ||
                items.length >= 100
              }
              type="submit"
            >
              <Plus size={16} /> 추가
            </button>
          </form>
          {lesson.status !== "준비 완료" && !completed && (
            <button
              className="button today-ready"
              disabled={props.blocked}
              onClick={() => void props.onStatus(lesson.id, "준비 완료")}
            >
              <CheckCheck size={18} /> 준비 완료로 표시
            </button>
          )}
        </section>
        <section className="today-record" aria-label="수업 메모">
          <h3>지난 수업 참고</h3>
          {previous ? (
            <div className="today-previous">
              <span>
                {previous.date} · {previous.grade}학년 {previous.classroom}반 ·{" "}
                {previous.subject}
              </span>
              <button
                className="today-previous-title"
                onClick={() => props.onOpen(previous)}
                disabled={props.busy}
              >
                {previous.title} <ArrowUpRight size={16} />
              </button>
              {previous.feedback || previous.notes ? (
                <details open>
                  <summary>지난 피드백과 참고사항</summary>
                  <div className="today-previous-body">
                    {previous.feedback && (
                      <p>
                        <strong>학생피드백</strong>
                        {previous.feedback}
                      </p>
                    )}
                    {previous.notes && (
                      <p>
                        <strong>참고사항</strong>
                        {previous.notes}
                      </p>
                    )}
                  </div>
                </details>
              ) : (
                <p className="today-hint">직전 수업에 남긴 메모가 없어요.</p>
              )}
            </div>
          ) : (
            <p className="today-hint">
              같은 학반·교과의 지난 수업이 아직 없어요.
            </p>
          )}
          {lesson.feedback && (
            <details className="today-details">
              <summary>이 수업에 저장한 피드백</summary>
              <p>{lesson.feedback}</p>
            </details>
          )}
          <form
            className="today-quick-record"
            onSubmit={(event) => {
              event.preventDefault();
              void props.onRecord(lesson.id, !completed);
            }}
          >
            <label htmlFor={`quick-${lesson.id}`}>수업 후 한 줄 기록</label>
            <textarea
              id={`quick-${lesson.id}`}
              rows={3}
              maxLength={20000}
              value={draft.note}
              disabled={props.busy}
              placeholder="아이들 반응이나 다음 시간에 이어갈 내용을 남겨보세요."
              onChange={(event) =>
                props.onDraft(lesson.id, { note: event.target.value })
              }
            />
            <p className="today-hint">
              기존 학생피드백 뒤에 추가됩니다. 다음 수업에서 참고할 수 있어요.
            </p>
            <div className="today-actions">
              {!completed && (
                <button
                  type="button"
                  className="button"
                  disabled={props.blocked || !draft.note.trim()}
                  onClick={() => void props.onRecord(lesson.id, false)}
                >
                  기록만 저장
                </button>
              )}
              <button
                type="submit"
                className="button primary"
                disabled={props.blocked || (completed && !draft.note.trim())}
              >
                <Check size={18} />
                {completed
                  ? "기록 추가 저장"
                  : draft.note.trim()
                    ? "기록 저장 · 수업 완료"
                    : "수업 완료"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </article>
  );
}
