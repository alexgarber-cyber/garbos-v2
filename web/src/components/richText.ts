/** Shared helpers for rich-text note fields, which store HTML as a string. */

/** True when HTML carries no visible content (e.g. "", "<p></p>", whitespace). */
export function htmlIsBlank(html: string | null | undefined): boolean {
  if (!html) return true;
  return (
    html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, "").length === 0
  );
}

/** Normalise editor HTML for storage: blank content becomes null. */
export function htmlToNullable(html: string | null | undefined): string | null {
  return htmlIsBlank(html) ? null : (html as string);
}
