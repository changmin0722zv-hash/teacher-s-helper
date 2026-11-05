"use client";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Copy, ClipboardPaste, Pencil, Trash2, Plus } from "lucide-react";

export type CalendarMenuTarget = {
  date: string;
  lessonId?: string;
  x: number;
  y: number;
  trigger: HTMLElement;
};
export type CalendarAction = "edit" | "copy" | "paste" | "delete" | "add";

export default function CalendarMenu({
  target,
  title,
  canPaste,
  onAction,
  onClose,
}: {
  target: CalendarMenuTarget;
  title: string;
  canPaste: boolean;
  onAction: (action: CalendarAction) => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = menu.current!;
    const rect = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(target.x, window.innerWidth - rect.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(target.y, window.innerHeight - rect.height - 8))}px`;
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({
      preventScroll: true,
    });
    const outside = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) onClose();
    };
    const anchor = target.trigger.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const scroll = (e: Event) => {
      const current = target.trigger.getBoundingClientRect();
      if (
        !el.contains(e.target as Node) &&
        (current.top !== anchor.top || current.left !== anchor.left)
      )
        onClose();
    };
    const resize = () => {
      if (
        window.innerWidth !== viewport.width ||
        window.innerHeight !== viewport.height
      )
        onClose();
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [target, onClose]);
  const actions = target.lessonId
    ? [
        { action: "edit", label: "수정", Icon: Pencil },
        { action: "copy", label: "복사", Icon: Copy },
        { action: "paste", label: "이 날짜에 붙여넣기", Icon: ClipboardPaste },
        { action: "delete", label: "삭제", Icon: Trash2 },
      ]
    : [
        { action: "add", label: "수업 추가", Icon: Plus },
        { action: "paste", label: "붙여넣기", Icon: ClipboardPaste },
      ];
  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label="달력 빠른 메뉴"
      className="calendar-context-menu"
      style={{ left: target.x, top: target.y }}
      onContextMenu={(e) => e.preventDefault()}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          target.trigger.focus();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const buttons = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ];
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length;
          buttons[next]?.focus({ preventScroll: true });
        }
      }}
    >
      <p className="calendar-menu-title" role="presentation">
        {title}
      </p>
      {actions.map(({ action, label, Icon }) => (
        <button
          key={action}
          role="menuitem"
          className={action === "delete" ? "danger" : ""}
          disabled={action === "paste" && !canPaste}
          onClick={() => {
            onClose();
            target.trigger.focus();
            onAction(action as CalendarAction);
          }}
        >
          <Icon size={17} />
          {label}
        </button>
      ))}
      {!canPaste && (
        <p className="calendar-menu-hint" role="presentation">
          수업을 복사하면 붙여넣을 수 있어요.
        </p>
      )}
    </div>,
    document.body,
  );
}
