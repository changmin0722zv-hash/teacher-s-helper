"use client";
import { useState } from "react";
import { Plus, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  dateSchema,
  koreaToday,
  shiftDate,
  type Planner,
  type TimetableSlot,
} from "@/lib/planner";
import { SCHOOL } from "@/lib/school";
import { mondayOf, weekCandidates, WEEKDAYS } from "@/lib/timetable";
import type { SchoolSync } from "./school-events";

type Props = {
  data: Planner;
  week: string;
  onWeek: (date: string) => void;
  sync: SchoolSync;
  blocked: boolean;
  busy: boolean;
  draft: TimetableSlot | null;
  onDraft: (slot: TimetableSlot | null) => void;
  onSaveSlot: (slot: TimetableSlot) => Promise<void>;
  onDeleteSlot: (id: string) => Promise<void>;
  onRegister: (selected: string[]) => Promise<void>;
  onCalendar: () => void;
};
export default function TimetableSettings(props: Props) {
  const { data, week, sync, draft } = props;
  const [choices, setChoices] = useState<Record<string, boolean>>({});
  const slots = data.timetable || [];
  const monday = mondayOf(week);
  const candidates = weekCandidates(slots, week, data.lessons, sync.events);
  const selected = candidates
    .filter((c) => !c.blocked && (choices[c.key] ?? !c.warnings.length))
    .map((c) => c.key);
  const startNew = (weekday = 1, period = 1) =>
    props.onDraft({
      id: crypto.randomUUID(),
      weekday,
      period,
      grade: 6,
      classroom: "1",
      subject: "영어",
      title: "",
      startDate: koreaToday(),
      endDate: null,
    });
  const patch = (value: Partial<TimetableSlot>) => {
    if (draft) props.onDraft({ ...draft, ...value });
  };
  const maxPeriod = Math.max(6, ...candidates.map((c) => c.slot.period));
  return (
    <div className="timetable-settings">
      <section className="school-profile" aria-label="등록된 학교">
        <div>
          <span className="eyebrow">MY SCHOOL</span>
          <h2>{SCHOOL.name}</h2>
          <p>
            {SCHOOL.educationOffice} · {SCHOOL.districtOffice}
          </p>
          <p>{SCHOOL.address}</p>
        </div>
        <a
          className="button"
          href={SCHOOL.website}
          target="_blank"
          rel="noopener noreferrer"
        >
          학교 홈페이지
        </a>
        {sync.error && (
          <details className="school-connection-help">
            <summary>학교 일정 연결 안내</summary>
            <p>
              나이스 인증키를 Vercel의 NEIS_API_KEY 환경변수에 저장하고 다시
              배포하면 학교 일정을 불러올 수 있습니다. 인증키는 이 화면에
              입력하지 않습니다.
            </p>
            <a
              href="https://open.neis.go.kr/portal/guide/apiGuidePage.do"
              target="_blank"
              rel="noopener noreferrer"
            >
              나이스 인증키 발급 안내 ↗
            </a>
          </details>
        )}
      </section>
      <section className="timetable-panel" aria-label="기초시간표 등록">
        <div className="timetable-heading">
          <div>
            <h2>기초시간표</h2>
            <p>
              담당 수업의 요일·교시·학반을 등록하세요. 적용 기간에 맞춰 매주
              필요한 수업을 만들 수 있어요.
            </p>
          </div>
          <button
            className="button primary"
            disabled={props.blocked || !!draft}
            onClick={() => startNew()}
          >
            <Plus size={18} /> 시간표 항목 추가
          </button>
        </div>
        <div className="timetable-week-picker">
          <button
            className="icon-button"
            aria-label="이전 주 시간표"
            onClick={() => props.onWeek(shiftDate(monday, -7))}
          >
            <ChevronLeft size={20} />
          </button>
          <label>
            등록할 주{" "}
            <input
              type="date"
              value={week}
              onChange={(e) => {
                if (dateSchema.safeParse(e.target.value).success)
                  props.onWeek(e.target.value);
              }}
            />
          </label>
          <button
            className="icon-button"
            aria-label="다음 주 시간표"
            onClick={() => props.onWeek(shiftDate(monday, 7))}
          >
            <ChevronRight size={20} />
          </button>
          <span>
            {monday} ~ {shiftDate(monday, 4)}
          </span>
          <button className="button" onClick={() => props.onWeek(koreaToday())}>
            이번 주
          </button>
        </div>
        {draft && (
          <form
            className="timetable-form"
            aria-label="시간표 항목 편집"
            onSubmit={(e) => {
              e.preventDefault();
              void props.onSaveSlot(draft);
            }}
          >
            <h3>
              {slots.some((s) => s.id === draft.id)
                ? "시간표 항목 편집"
                : "새 시간표 항목"}
            </h3>
            <fieldset disabled={props.busy}>
              <div className="timetable-form-grid">
                <label>
                  요일
                  <select
                    value={draft.weekday}
                    onChange={(e) => patch({ weekday: Number(e.target.value) })}
                  >
                    {WEEKDAYS.map((day, i) => (
                      <option key={day} value={i + 1}>
                        {day}요일
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  교시
                  <select
                    value={draft.period}
                    onChange={(e) => patch({ period: Number(e.target.value) })}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i} value={i + 1}>
                        {i + 1}교시
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  학년
                  <select
                    value={draft.grade}
                    onChange={(e) => patch({ grade: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5, 6].map((g) => (
                      <option key={g} value={g}>
                        {g}학년
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  학반
                  <input
                    required
                    maxLength={40}
                    value={draft.classroom}
                    onChange={(e) => patch({ classroom: e.target.value })}
                  />
                </label>
                <label>
                  교과
                  <input
                    required
                    maxLength={160}
                    value={draft.subject}
                    onChange={(e) => patch({ subject: e.target.value })}
                  />
                </label>
                <label>
                  기본 수업제목
                  <input
                    maxLength={160}
                    value={draft.title}
                    placeholder="비우면 ‘교과명 수업’으로 등록"
                    onChange={(e) => patch({ title: e.target.value })}
                  />
                </label>
                <label>
                  적용 시작일
                  <input
                    required
                    type="date"
                    value={draft.startDate}
                    onChange={(e) => patch({ startDate: e.target.value })}
                  />
                </label>
                <label>
                  적용 종료일
                  <input
                    type="date"
                    min={draft.startDate}
                    value={draft.endDate || ""}
                    onChange={(e) => patch({ endDate: e.target.value || null })}
                  />
                </label>
              </div>
              <p className="today-hint">
                종료일을 비우면 계속 적용합니다. 저장한 시간표를 바꿔도 이미
                등록한 수업은 유지됩니다.
              </p>
              <div className="inline-actions">
                <button
                  className="button"
                  type="button"
                  onClick={() => props.onDraft(null)}
                >
                  편집 취소
                </button>
                <button
                  className="button primary"
                  disabled={props.blocked}
                  type="submit"
                >
                  시간표 저장
                </button>
              </div>
            </fieldset>
          </form>
        )}
        <div className="timetable-scroll">
          <table className="base-timetable">
            <caption>{monday} 주에 적용되는 기초시간표</caption>
            <thead>
              <tr>
                <th scope="col">교시</th>
                {WEEKDAYS.map((day) => (
                  <th scope="col" key={day}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxPeriod }, (_, i) => (
                <tr key={i}>
                  <th scope="row">{i + 1}교시</th>
                  {WEEKDAYS.map((day, index) => {
                    const cell = candidates.find(
                      (c) =>
                        c.slot.weekday === index + 1 && c.slot.period === i + 1,
                    );
                    return (
                      <td key={day}>
                        {cell ? (
                          <button
                            className="timetable-cell"
                            disabled={props.blocked || !!draft}
                            onClick={() => props.onDraft({ ...cell.slot })}
                            aria-label={`${day}요일 ${i + 1}교시 ${cell.slot.grade}-${cell.slot.classroom} ${cell.slot.subject} 편집`}
                          >
                            <strong>
                              {cell.slot.grade}-{cell.slot.classroom}
                            </strong>
                            <span>{cell.slot.subject}</span>
                          </button>
                        ) : (
                          <button
                            className="timetable-cell empty"
                            disabled={props.blocked || !!draft}
                            aria-label={`${day}요일 ${i + 1}교시 추가`}
                            onClick={() => startNew(index + 1, i + 1)}
                          >
                            <Plus size={16} />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="timetable-all" open={slots.length === 0}>
          <summary>등록한 전체 시간표 · {slots.length}개</summary>
          {!slots.length ? (
            <p>
              아직 등록한 기초시간표가 없어요. 위의 추가 버튼으로 담당 수업부터
              등록해 주세요.
            </p>
          ) : (
            <ul>
              {slots.map((s) => (
                <li key={s.id}>
                  <button
                    className="timetable-slot-label"
                    disabled={props.blocked || !!draft}
                    onClick={() => props.onDraft({ ...s })}
                  >
                    <strong>
                      {WEEKDAYS[s.weekday - 1]} {s.period}교시 · {s.grade}-
                      {s.classroom} · {s.subject}
                    </strong>
                    <span>
                      {s.startDate} ~ {s.endDate || "계속"}
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    disabled={props.blocked || !!draft}
                    aria-label={`${WEEKDAYS[s.weekday - 1]} ${s.period}교시 시간표 삭제`}
                    onClick={() => {
                      if (
                        confirm(
                          "이 기초시간표 항목을 삭제할까요? 이미 등록한 수업은 남습니다.",
                        )
                      )
                        void props.onDeleteSlot(s.id);
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>
      <section className="timetable-panel" aria-label="주간 수업 일괄 등록">
        <div className="timetable-heading">
          <div>
            <h2>이번 주 수업 일괄 등록</h2>
            <p>
              등록할 수업을 확인하고 선택하세요. 등록 후에는 달력에서 각각
              자유롭게 수정할 수 있어요.
            </p>
          </div>
          <button className="button" onClick={props.onCalendar}>
            선택한 주 달력 보기
          </button>
        </div>
        {!sync.fresh || sync.error ? (
          <p className="timetable-advice">
            {sync.loading
              ? "학교 일정 확인 중입니다."
              : "최신 학교 일정을 확인하지 못했습니다. 학교 행사·휴업일은 직접 확인한 뒤 등록해 주세요."}
          </p>
        ) : (
          <p className="today-hint">
            학교 일정과 교시 미지정 기존 수업이 있는 항목은 기본 선택에서
            제외합니다. 확인 후 직접 선택할 수 있어요.
          </p>
        )}
        {draft && (
          <p className="timetable-advice">
            편집 중인 기초시간표를 먼저 저장하거나 편집을 취소해 주세요.
          </p>
        )}
        {!candidates.length ? (
          <p className="empty-state">
            선택한 주에 적용되는 기초시간표가 없어요.
          </p>
        ) : (
          <>
            <div className="timetable-scroll">
              <table className="weekly-preview">
                <caption>
                  등록 대상 · {monday} ~ {shiftDate(monday, 4)}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">선택</th>
                    <th scope="col">날짜·교시</th>
                    <th scope="col">수업</th>
                    <th scope="col">확인 사항</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.key}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${c.date} ${c.slot.period}교시 ${c.slot.grade}-${c.slot.classroom} 등록`}
                          disabled={
                            props.blocked ||
                            !!c.blocked ||
                            sync.loading ||
                            !!draft
                          }
                          checked={selected.includes(c.key)}
                          onChange={(e) =>
                            setChoices((prev) => ({
                              ...prev,
                              [c.key]: e.target.checked,
                            }))
                          }
                        />
                      </td>
                      <td>
                        {c.date}
                        <br />
                        {WEEKDAYS[c.slot.weekday - 1]} · {c.slot.period}교시
                      </td>
                      <td>
                        <strong>
                          {c.slot.grade}-{c.slot.classroom} {c.slot.subject}
                        </strong>
                        <br />
                        {c.slot.title || `${c.slot.subject} 수업`}
                      </td>
                      <td>
                        {[c.blocked, ...c.warnings]
                          .filter(Boolean)
                          .join(" / ") || "등록 가능"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="timetable-register">
              <span>
                선택 {selected.length}개 · 이미 등록/교시 겹침{" "}
                {candidates.filter((c) => c.blocked).length}개
              </span>
              <button
                className="button primary"
                disabled={
                  props.blocked || sync.loading || !!draft || !selected.length
                }
                onClick={() => void props.onRegister(selected)}
              >
                선택한 {selected.length}개 수업 등록
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
