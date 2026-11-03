"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Plus,
  BookOpen,
  Bookmark,
  Download,
  X,
  RefreshCw,
} from "lucide-react";
import { SUBJECTS, type Lesson } from "@/lib/planner";
import {
  emptyClassification,
  emptyFilters,
  parseTags,
  resourceSchema,
  type Classification,
  type LibraryFilters,
  type LibraryItem,
  type LibraryResource,
  type SavedSearch,
  type SourceReference,
} from "@/lib/library-model";

type Reuse = {
  item: LibraryItem;
  excerpt: string;
  mode: SourceReference["mode"];
  targetId?: string;
  date?: string;
  grade?: number;
  classroom?: string;
};
async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body;
}
const json = (body: unknown) => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export default function TeachingLibrary({
  lessons,
  onReuse,
  onDirty,
  backend,
}: {
  lessons: Lesson[];
  onReuse: (request: Reuse) => Promise<boolean>;
  onDirty: (dirty: boolean) => void;
  backend?: string;
}) {
  const [filters, setFilters] = useState<LibraryFilters>(emptyFilters),
    [page, setPage] = useState(0),
    [items, setItems] = useState<LibraryItem[]>([]),
    [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<LibraryItem | null>(null),
    [edit, setEdit] = useState<LibraryResource | null>(null),
    [meta, setMeta] = useState<Classification | null>(null);
  const [searches, setSearches] = useState<SavedSearch[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [excerpt, setExcerpt] = useState(""),
    [target, setTarget] = useState(""),
    [date, setDate] = useState(""),
    [grade, setGrade] = useState(3),
    [classroom, setClassroom] = useState("");
  const detailRequest = useRef(0);
  const initialOpened = useRef(false);
  const dirty = Boolean(edit || meta);
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setItems([]);
    const timer = setTimeout(() => {
      setError("");
      api(
        "/api/library?" +
          new URLSearchParams({ ...filters, page: String(page) }),
        { signal: controller.signal },
      )
        .then((body) => {
          setItems(body.items);
          setTotal(body.total);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, page, refresh]);
  useEffect(() => {
    let active = true;
    api("/api/library?searches=true")
      .then((b) => {
        if (active) setSearches(b.searches);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  function filter(p: Partial<LibraryFilters>) {
    setFilters((f) => ({ ...f, ...p }));
    setPage(0);
  }
  const open = useCallback(
    async (id: string, version?: string) => {
      if (dirty && !confirm("저장하지 않은 자료 편집을 닫을까요?")) return;
      const seq = ++detailRequest.current;
      setLoading(true);
      setError("");
      try {
        const item = await api(
          "/api/library?" +
            new URLSearchParams({ id, ...(version ? { version } : {}) }),
        );
        if (seq !== detailRequest.current) return;
        setSelected(item);
        setEdit(null);
        setMeta(null);
        setExcerpt("");
        setNotice("");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (seq === detailRequest.current) setLoading(false);
      }
    },
    [dirty],
  );
  useEffect(() => {
    if (initialOpened.current) return;
    initialOpened.current = true;
    const p = new URLSearchParams(window.location.search);
    if (p.get("libraryId"))
      void open(p.get("libraryId")!, p.get("version") || undefined);
  }, [open]);
  async function save() {
    if (!selected || !meta) return;
    setBusy(true);
    setError("");
    try {
      let resource: LibraryResource | undefined;
      if (edit)
        resource = resourceSchema.parse({
          ...edit,
          classification: meta,
          updatedAt: new Date().toISOString(),
        });
      const saved = await api(
        "/api/library",
        json({
          id: selected.id,
          version: selected.version,
          classification: meta,
          resource,
        }),
      );
      setSelected(saved);
      setEdit(null);
      setMeta(null);
      setNotice("자료와 분류를 저장했습니다.");
      setRefresh((r) => r + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function create() {
    if (dirty && !confirm("저장하지 않은 편집을 닫을까요?")) return;
    const now = new Date().toISOString();
    const c = emptyClassification();
    c.materialStatus = "수정 중 초안";
    const r: LibraryResource = {
      id: crypto.randomUUID(),
      title: "",
      type: "초안",
      content: "",
      links: [],
      classification: c,
      references: [],
      createdAt: now,
      updatedAt: now,
    };
    setSelected({
      id: r.id,
      kind: "resource",
      title: "새 자료",
      subject: "",
      grade: null,
      date: null,
      type: "초안",
      version: "",
      content: "",
      classification: c,
      references: [],
    });
    setMeta(c);
    setEdit(r);
    setError("");
  }
  async function reuse(mode: SourceReference["mode"], calendar = false) {
    if (!selected) return;
    if (mode !== "reference" && !excerpt.trim()) {
      setError("가져올 부분을 아래 칸에 입력하거나 붙여 넣어 주세요.");
      return;
    }
    if (mode !== "adapt" && !target) {
      setError("자료를 추가할 수업을 선택해 주세요.");
      return;
    }
    if (calendar && (!date || !classroom.trim())) {
      setError("실시일과 학반을 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ok = await onReuse({
        item: selected,
        excerpt,
        mode,
        targetId: mode === "adapt" ? undefined : target,
        ...(calendar ? { date, grade, classroom } : {}),
      });
      if (ok) {
        setNotice(
          calendar
            ? "수업 계획에 등록했습니다."
            : mode === "adapt"
              ? "독립 초안으로 저장했습니다."
              : "선택한 수업에 출처와 함께 추가했습니다.",
        );
        setRefresh((r) => r + 1);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveSearch() {
    const name = prompt("이 검색 조건의 책장 이름을 입력하세요.");
    if (!name?.trim()) return;
    try {
      const b = await api("/api/library", {
        ...json({
          action: "save-search",
          search: { id: crypto.randomUUID(), name: name.trim(), filters },
        }),
        method: "POST",
      });
      setSearches(b.searches);
      setNotice("검색 조건을 클라우드에 저장했습니다.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function removeSearch(id: string) {
    try {
      const b = await api("/api/library", {
        ...json({ action: "delete-search", id }),
        method: "POST",
      });
      setSearches(b.searches);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function exportSelected() {
    if (!selected) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(selected, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `수업자료-${selected.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="teaching-library" aria-label="수업 자료실">
      <div className="library-toolbar">
        <p>
          {backend === "database"
            ? "클라우드 DB에서 조회합니다."
            : backend === "demo"
              ? "로컬 검증용 자료실입니다."
              : "클라우드 연결을 확인해 주세요."}{" "}
          모든 연도의 수업·단원·초안을 검색합니다.
        </p>
        <button className="button primary" onClick={create} disabled={busy}>
          <Plus size={17} />
          날짜 없는 자료 추가
        </button>
      </div>
      <div className="library-search">
        <Search size={19} />
        <input
          aria-label="자료실 전체 본문 검색"
          placeholder="제목·활동·단원 비고·학생피드백까지 검색…"
          value={filters.q}
          onChange={(e) => filter({ q: e.target.value })}
        />
        <button
          className="icon-button"
          aria-label="자료실 새로고침"
          onClick={() => setRefresh((r) => r + 1)}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      <div className="library-filters">
        <label>
          교과
          <select
            value={filters.subject}
            onChange={(e) => filter({ subject: e.target.value })}
          >
            <option value="">모든 교과</option>
            {SUBJECTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          학년
          <select
            value={filters.grade}
            onChange={(e) => filter({ grade: e.target.value })}
          >
            <option value="">모든 학년</option>
            <option value="1-2">1~2학년군</option>
            <option value="3-4">3~4학년군</option>
            <option value="5-6">5~6학년군</option>
            {[1, 2, 3, 4, 5, 6].map((g) => (
              <option key={g} value={g}>
                {g}학년
              </option>
            ))}
          </select>
        </label>
        <label>
          자료 종류
          <select
            value={filters.kind}
            onChange={(e) =>
              filter({ kind: e.target.value as LibraryFilters["kind"] })
            }
          >
            <option value="">모든 자료</option>
            <option value="lesson">수업 기록</option>
            <option value="unit">단원 계획</option>
            <option value="resource">초안·활동·참고 자료</option>
          </select>
        </label>
        <label>
          자료 상태
          <select
            value={filters.status}
            onChange={(e) => filter({ status: e.target.value })}
          >
            {["", "미분류", "수정 중 초안", "사용 가능", "보관"].map((v) => (
              <option key={v} value={v}>
                {v || "모든 상태"}
              </option>
            ))}
          </select>
        </label>
        <label>
          라벨
          <input
            value={filters.tag}
            onChange={(e) => filter({ tag: e.target.value })}
            placeholder="감정, 카드 제작…"
          />
        </label>
        <label className="library-check">
          <input
            type="checkbox"
            checked={filters.favorite === "true"}
            onChange={(e) =>
              filter({ favorite: e.target.checked ? "true" : "" })
            }
          />
          즐겨찾기
        </label>
      </div>
      <details>
        <summary>교육과정·시간·연도 조건</summary>
        <div className="library-filters">
          <label>
            교육과정
            <input
              value={filters.curriculum}
              onChange={(e) => filter({ curriculum: e.target.value })}
              placeholder="2022 개정"
            />
          </label>
          <label>
            교사가 연결한 성취기준
            <input
              value={filters.standard}
              onChange={(e) => filter({ standard: e.target.value })}
              placeholder="기준 코드"
            />
          </label>
          <label>
            최대 소요 시간(분)
            <input
              type="number"
              min="1"
              max="1000"
              value={filters.maxMinutes}
              onChange={(e) => filter({ maxMinutes: e.target.value })}
            />
          </label>
          <label>
            실시 연도
            <input
              value={filters.year === "undated" ? "" : filters.year}
              maxLength={4}
              placeholder="전체 연도"
              onChange={(e) =>
                filter({ year: e.target.value.replace(/\D/g, "") })
              }
            />
          </label>
          <label className="library-check">
            <input
              type="checkbox"
              checked={filters.year === "undated"}
              onChange={(e) =>
                filter({ year: e.target.checked ? "undated" : "" })
              }
            />
            실시일 없는 자료
          </label>
        </div>
        <p className="muted">
          시간은 자료에 기록된 범위(전체 수업·핵심 활동·개별 활동)를 확인하세요.
          미분류 자료도 본문으로 검색됩니다.
        </p>
      </details>
      <div className="library-shelves">
        <button
          className="button"
          onClick={() => {
            setFilters(emptyFilters());
            setPage(0);
          }}
        >
          조건 초기화
        </button>
        <button className="button" onClick={() => void saveSearch()}>
          <Bookmark size={16} />
          검색 조건 저장
        </button>
        {searches.map((s) => (
          <span key={s.id}>
            <button
              className="button"
              onClick={() => {
                setFilters(s.filters);
                setPage(0);
              }}
            >
              {s.name}
            </button>
            <button
              className="icon-button"
              aria-label={`${s.name} 책장 삭제`}
              onClick={() => void removeSearch(s.id)}
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <p aria-live="polite">
        {loading
          ? "자료를 불러오는 중…"
          : `${total}개 자료 · ${page + 1}페이지`}
      </p>
      <div className="library-grid">
        <div className="library-results">
          {items.map((i) => (
            <button
              className={`library-card ${selected?.id === i.id ? "selected" : ""}`}
              key={i.id}
              disabled={loading || busy}
              onClick={() => void open(i.id)}
            >
              <span className="eyebrow">
                {i.type} · {i.subject || "교과 미분류"}{" "}
                {i.grade ? `· ${i.grade}학년` : ""}
              </span>
              <strong>{i.title}</strong>
              <span>
                {i.classification.materialStatus} · {i.date || "실시일 미정"}
              </span>
              <span className="library-snippet">{i.content}</span>
              <span>
                {[...i.classification.topics, ...i.classification.methods]
                  .slice(0, 5)
                  .join(" · ")}
              </span>
              {i.classification.duration && (
                <span>
                  {i.classification.durationScope} {i.classification.duration}분
                </span>
              )}
            </button>
          ))}
          {!loading && !items.length && (
            <p className="empty">
              검색 결과가 없습니다. 조건을 줄이거나 본문에 사용한 단어로
              찾아보세요.
            </p>
          )}
          <div className="library-actions">
            <button
              className="button"
              disabled={!page || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              이전
            </button>
            <button
              className="button"
              disabled={(page + 1) * 20 >= total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </button>
          </div>
        </div>
        <article className="library-detail" aria-label="선택한 자료">
          {!selected ? (
            <p>
              <BookOpen size={25} />
              자료를 선택하면 원문과 분류, 활용 방법을 확인할 수 있습니다.
            </p>
          ) : (
            <>
              <div className="library-toolbar">
                <h2>{selected.title}</h2>
                <button
                  className="icon-button"
                  aria-label="자료 미리보기 닫기"
                  onClick={() => {
                    if (!dirty || confirm("저장하지 않은 편집을 닫을까요?")) {
                      setSelected(null);
                      setEdit(null);
                      setMeta(null);
                    }
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              <p>
                {selected.type} · {selected.date || "실시일 미정"} ·{" "}
                {selected.classification.materialStatus}
              </p>
              {edit ? (
                <>
                  <label>
                    자료 제목
                    <input
                      value={edit.title}
                      onChange={(e) =>
                        setEdit({ ...edit, title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    자료 유형
                    <select
                      aria-label="자료 유형"
                      value={edit.type}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          type: e.target.value as LibraryResource["type"],
                        })
                      }
                    >
                      {["초안", "활동", "평가 도구", "참고 자료"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    자료 본문
                    <textarea
                      rows={14}
                      value={edit.content}
                      onChange={(e) =>
                        setEdit({ ...edit, content: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    참고 링크(한 줄에 하나)
                    <textarea
                      value={edit.links.join("\n")}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          links: e.target.value.split("\n").filter(Boolean),
                        })
                      }
                    />
                  </label>
                  <p className="muted">
                    링크는 참고 주소로 보관됩니다. 연결된 파일 본문을 자동
                    수집하지 않습니다.
                  </p>
                </>
              ) : (
                <>
                  <pre className="library-content">{selected.content}</pre>
                  {selected.resource?.links.map((url) => (
                    <p key={url}>
                      <a href={url} target="_blank" rel="noreferrer">
                        {url}
                      </a>
                    </p>
                  ))}
                </>
              )}
              {!meta ? (
                <div className="library-actions">
                  <button
                    className="button"
                    onClick={() => {
                      setMeta(structuredClone(selected.classification));
                      if (selected.resource)
                        setEdit(structuredClone(selected.resource));
                    }}
                  >
                    분류·자료 편집
                  </button>
                  <button className="button" onClick={exportSelected}>
                    <Download size={15} />이 자료 내려받기
                  </button>
                </div>
              ) : (
                <>
                  <ClassificationFields value={meta} onChange={setMeta} />
                  <div className="library-actions">
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => void save()}
                    >
                      자료 저장
                    </button>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        setEdit(null);
                        setMeta(null);
                      }}
                    >
                      편집 취소
                    </button>
                  </div>
                </>
              )}
              {!meta && (
                <>
                  <div className="library-tags">
                    {[
                      ...selected.classification.topics,
                      ...selected.classification.actions,
                      ...selected.classification.methods,
                      ...selected.classification.supports,
                      ...selected.classification.contexts,
                    ].map((x, i) => (
                      <span key={i}>{x}</span>
                    ))}
                  </div>
                  <p>{selected.classification.conditions}</p>
                  <p>
                    {selected.classification.duration
                      ? `${selected.classification.durationScope} ${selected.classification.duration}분`
                      : ""}
                  </p>
                  {selected.classification.standards.map((s, i) => (
                    <p key={i}>
                      {s.code} · {s.verification} · {s.alignment}
                      <br />
                      {s.text}
                      <br />
                      {s.edition} {s.source}
                    </p>
                  ))}
                  <details className="library-reuse">
                    <summary>이 자료 활용하기</summary>
                    <p>
                      원본을 보존하며 선택한 내용만 추가합니다. 과거 학생 반응을
                      새 수업의 피드백으로 복사하지 않습니다.
                    </p>
                    <label>
                      가져올 부분
                      <textarea
                        rows={6}
                        value={excerpt}
                        maxLength={20000}
                        onChange={(e) => setExcerpt(e.target.value)}
                        placeholder="위 원문에서 필요한 부분을 복사해 넣으세요. 미확정 사항과 준비 조건도 함께 확인하세요."
                      />
                    </label>
                    <label>
                      추가할 수업
                      <select
                        aria-label="추가할 수업"
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                      >
                        <option value="">수업 선택</option>
                        {[...lessons]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.date} · {l.grade}-{l.classroom} · {l.title}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="library-actions">
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void reuse("reference")}
                      >
                        참고로 연결
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void reuse("excerpt")}
                      >
                        선택한 부분 추가
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void reuse("adapt")}
                      >
                        독립 초안으로 재구성
                      </button>
                    </div>
                    <details>
                      <summary>새 수업으로 달력에 등록</summary>
                      <div className="library-filters">
                        <label>
                          실시일
                          <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                          />
                        </label>
                        <label>
                          실시 학년
                          <select
                            value={grade}
                            onChange={(e) => setGrade(Number(e.target.value))}
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
                            value={classroom}
                            onChange={(e) => setClassroom(e.target.value)}
                          />
                        </label>
                      </div>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void reuse("adapt", true)}
                      >
                        선택한 내용으로 수업 등록
                      </button>
                    </details>
                  </details>
                  {selected.references.length > 0 && (
                    <details>
                      <summary>가져온 자료의 출처</summary>
                      {selected.references.map((r, i) => (
                        <div key={i}>
                          <button
                            className="button"
                            onClick={() => void open(r.sourceId, r.version)}
                          >
                            {r.title} · 참조 당시 원문
                          </button>
                          <p>{r.addedAt.slice(0, 10)}</p>
                          <pre className="library-content">{r.excerpt}</pre>
                        </div>
                      ))}
                    </details>
                  )}
                </>
              )}
            </>
          )}
        </article>
      </div>
    </section>
  );
}

function ClassificationFields({
  value: c,
  onChange,
}: {
  value: Classification;
  onChange: (c: Classification) => void;
}) {
  const patch = (p: Partial<Classification>) => onChange({ ...c, ...p });
  return (
    <div className="classification-fields">
      <h3>분류와 운영 조건</h3>
      <p className="muted">
        모르는 항목은 비워도 저장·검색할 수 있습니다. 분류는 실제 수업 완료
        상태와 별개입니다.
      </p>
      <div className="library-filters">
        <label>
          자료 상태
          <select
            aria-label="자료 상태"
            value={c.materialStatus}
            onChange={(e) =>
              patch({
                materialStatus: e.target
                  .value as Classification["materialStatus"],
              })
            }
          >
            {["미분류", "수정 중 초안", "사용 가능", "보관"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="library-check">
          <input
            type="checkbox"
            checked={c.favorite}
            onChange={(e) => patch({ favorite: e.target.checked })}
          />
          즐겨찾기
        </label>
      </div>
      <fieldset>
        <legend>주교과·연계교과</legend>
        <p className="muted">
          독립 자료는 첫 선택 교과를 주교과로 표시합니다. 기존 수업의 실제
          교과는 바꾸지 않습니다.
        </p>
        <div className="library-checkboxes">
          {SUBJECTS.map((s) => (
            <label key={s}>
              <input
                type="checkbox"
                checked={c.subjects.includes(s)}
                onChange={(e) =>
                  patch({
                    subjects: e.target.checked
                      ? [...c.subjects, s]
                      : c.subjects.filter((x) => x !== s),
                  })
                }
              />
              {s}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>활용 가능 학년</legend>
        <div className="library-checkboxes">
          {[1, 2, 3, 4, 5, 6].map((g) => (
            <label key={g}>
              <input
                type="checkbox"
                checked={c.grades.includes(g)}
                onChange={(e) =>
                  patch({
                    grades: e.target.checked
                      ? [...c.grades, g]
                      : c.grades.filter((x) => x !== g),
                  })
                }
              />
              {g}학년
            </label>
          ))}
        </div>
      </fieldset>
      {(
        [
          ["topics", "주제·개념"],
          ["actions", "학생이 하는 일"],
          ["methods", "활동 방식"],
          ["supports", "지원 방식"],
          ["contexts", "사용 맥락"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label} (쉼표로 구분)
          <input
            value={c[key].join(", ")}
            onChange={(e) =>
              patch({
                [key]: e.target.value.split(",").map((x) => x.trimStart()),
              })
            }
            onBlur={() => patch({ [key]: parseTags(c[key].join(",")) })}
          />
        </label>
      ))}
      <div className="library-filters">
        <label>
          소요 시간(분)
          <input
            type="number"
            min="1"
            max="1000"
            value={c.duration ?? ""}
            onChange={(e) =>
              patch({
                duration: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
        <label>
          시간 범위
          <select
            value={c.durationScope}
            onChange={(e) =>
              patch({
                durationScope: e.target
                  .value as Classification["durationScope"],
              })
            }
          >
            {["전체 수업", "핵심 활동", "개별 활동"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        준비·운영 조건과 미확정 사항
        <textarea
          rows={3}
          value={c.conditions}
          onChange={(e) => patch({ conditions: e.target.value })}
        />
      </label>
      <label>
        산출물·평가 자료
        <input
          value={c.output}
          onChange={(e) => patch({ output: e.target.value })}
        />
      </label>
      <details>
        <summary>교육과정·성취기준 연결</summary>
        <label>
          교육과정 계열
          <input
            placeholder="예: 2022 개정"
            value={c.curriculum}
            onChange={(e) => patch({ curriculum: e.target.value })}
          />
        </label>
        <label>
          고시·문서 판본
          <input
            value={c.edition}
            onChange={(e) => patch({ edition: e.target.value })}
          />
        </label>
        <label>
          교과 영역
          <input
            value={c.domain}
            onChange={(e) => patch({ domain: e.target.value })}
          />
        </label>
        <p className="muted">
          공식 원문 확인과 이 수업에 연결하는 판단은 별개입니다. 확인하지 않은
          기준은 ‘미확인’으로 보관하세요.
        </p>
        {c.standards.map((s, i) => (
          <fieldset key={i}>
            <legend>성취기준 {i + 1}</legend>
            {(
              [
                ["code", "기준 코드"],
                ["text", "기준 내용"],
                ["edition", "기준 판본"],
                ["source", "출처·쪽수"],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  value={s[k]}
                  onChange={(e) =>
                    patch({
                      standards: c.standards.map((x, j) =>
                        j === i ? { ...x, [k]: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <label>
              원문 검증
              <select
                value={s.verification}
                onChange={(e) =>
                  patch({
                    standards: c.standards.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            verification: e.target
                              .value as typeof s.verification,
                          }
                        : x,
                    ),
                  })
                }
              >
                {["미확인", "원문 확인", "구판"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              수업 연결 판단
              <select
                value={s.alignment}
                onChange={(e) =>
                  patch({
                    standards: c.standards.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            alignment: e.target.value as typeof s.alignment,
                          }
                        : x,
                    ),
                  })
                }
              >
                {["추천", "교사 연결", "재검토"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button"
              onClick={() =>
                patch({ standards: c.standards.filter((_, j) => j !== i) })
              }
            >
              이 기준 연결 삭제
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button"
          onClick={() =>
            patch({
              standards: [
                ...c.standards,
                {
                  code: "",
                  text: "",
                  edition: "",
                  source: "",
                  verification: "미확인",
                  alignment: "추천",
                },
              ],
            })
          }
        >
          성취기준 연결 추가
        </button>
      </details>
    </div>
  );
}
export type { Reuse };
