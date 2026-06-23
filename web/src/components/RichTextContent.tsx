import DOMPurify from "isomorphic-dompurify";

import { htmlIsBlank } from "./richText";

// Only the tags/attrs the editor (StarterKit + Highlight) can emit survive
// sanitisation; everything else is stripped before it reaches the DOM.
const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "mark", "a",
  "ul", "ol", "li", "blockquote", "code", "pre", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
];
const ALLOWED_ATTR = ["href", "target", "rel"];

/** Render stored note HTML, sanitised. Server-safe (isomorphic-dompurify). */
export function RichTextContent({
  html,
  className = "",
}: {
  html: string | null | undefined;
  className?: string;
}) {
  if (htmlIsBlank(html)) return null;
  const clean = DOMPurify.sanitize(html ?? "", { ALLOWED_TAGS, ALLOWED_ATTR });
  return (
    <div
      className={`richtext ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
