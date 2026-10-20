import type { Lesson } from "./planner";

// Previous lessons come from the full dataset, independent of today's filters.
export function previousLesson(
  current: Lesson,
  lessons: Lesson[],
): Lesson | undefined {
  return lessons
    .filter(
      (lesson) =>
        lesson.id !== current.id &&
        lesson.date < current.date &&
        lesson.grade === current.grade &&
        lesson.classroom === current.classroom &&
        lesson.subject === current.subject,
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.id.localeCompare(b.id),
    )[0];
}

export function resourceLinks(text: string): { href: string; label: string }[] {
  const links = new Map<string, string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'\u3000]+/gi)) {
    let raw = match[0].replace(/[.,;!?。、]+$/, "");
    // Strip Markdown delimiters while retaining balanced parentheses in URLs.
    while (
      raw.endsWith(")") &&
      (raw.match(/\)/g)?.length || 0) > (raw.match(/\(/g)?.length || 0)
    )
      raw = raw.slice(0, -1);
    raw = raw.replace(/[\]}>]+$/, "");
    try {
      const url = new URL(raw);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        continue;
      links.set(url.href, url.hostname.replace(/^www\./, ""));
    } catch {
      /* Plain text stays visible even if it is not a valid link. */
    }
  }
  return [...links].map(([href, label]) => ({ href, label }));
}

export function appendFeedback(existing: string, addition: string): string {
  const text = addition.trim();
  return text ? (existing ? `${existing}\n\n${text}` : text) : existing;
}
