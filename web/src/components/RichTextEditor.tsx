"use client";

import Highlight from "@tiptap/extension-highlight";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useReducer } from "react";

import { htmlIsBlank } from "./richText";

// Underline ships inside StarterKit v3; only Highlight is added separately.
const TOOLBAR: {
  name: string;
  label: string;
  className: string;
  run: (e: Editor) => void;
}[] = [
  { name: "bold", label: "B", className: "font-semibold", run: (e) => e.chain().focus().toggleBold().run() },
  { name: "italic", label: "I", className: "italic", run: (e) => e.chain().focus().toggleItalic().run() },
  { name: "underline", label: "U", className: "underline", run: (e) => e.chain().focus().toggleUnderline().run() },
  { name: "highlight", label: "H", className: "rounded bg-[#fde68a] px-1", run: (e) => e.chain().focus().toggleHighlight().run() },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  // TipTap mutates its own state; force a re-render so toolbar active states
  // and the empty-placeholder reflect the current selection.
  const [, force] = useReducer((x: number) => x + 1, 0);

  const editor = useEditor({
    extensions: [StarterKit, Highlight],
    content: value || "",
    immediatelyRender: false, // required for Next.js SSR (avoids hydration mismatch)
    editorProps: {
      attributes: { class: "richtext min-h-[4.5rem] px-3 py-2 outline-none" },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onTransaction: () => force(),
  });

  // Reflect external value changes (async-loaded edit forms, post-submit resets)
  // without feeding back into onUpdate.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && !(editor.isEmpty && htmlIsBlank(value))) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <div className="rounded-[var(--radius-base)] border border-[var(--color-border)] text-sm focus-within:border-[var(--color-accent)]">
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-1.5 py-1">
        {TOOLBAR.map((b) => (
          <button
            key={b.name}
            type="button"
            tabIndex={-1}
            aria-label={b.name}
            onMouseDown={(e) => e.preventDefault()} // keep selection on click
            onClick={() => editor && b.run(editor)}
            className={`h-7 w-7 rounded text-sm leading-none transition-colors ${b.className} ${
              editor?.isActive(b.name)
                ? "bg-[var(--color-surface)] text-[var(--color-fg)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="relative">
        {placeholder && editor?.isEmpty && (
          <div className="pointer-events-none absolute px-3 py-2 text-sm text-[var(--color-muted)]">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
