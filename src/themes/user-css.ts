const ID = "user-css";

/** The user's own stylesheet, last in `<head>` so it overrides the theme (D-9). */
export function applyUserCss(doc: Document, css: string | null): void {
  doc.getElementById(ID)?.remove();
  if (css === null) return;
  const style = doc.createElement("style");
  style.id = ID;
  style.textContent = css;
  doc.head.append(style);
}
