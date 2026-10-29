// A deterministic large document for the performance benchmarks, shaped like a long README
// or manual: mostly prose and lists, a code block per section, and now and then a table,
// math, an alert, a footnote and a nested heading. `diagrams` Mermaid fences are spread
// evenly through it.

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor " +
  "incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud " +
  "exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

function paragraph(n: number, k: number): string {
  const note = k === 0 && n % 2 === 0 ? `[^n${n}]` : "";
  const math = k === 1 && n % 4 === 0 ? ` The cost grows as $O(n \\log n)$ for ${n} items.` : "";
  return `Nacho Viewer renders **Markdown** the way _GitHub_ does: \`option${n}.${k}\` sets the widget, [the guide](https://example.com/guide/${n}) explains it${note}, and ~~nothing~~ is lost.${math} ${LOREM}\n\n`;
}

function section(n: number): string {
  let s = `## Section ${n}: configuring the widget\n\n`;
  for (let k = 0; k < 3; k++) s += paragraph(n, k);
  s += `- [x] parse the source\n- [ ] sanitise the HTML\n  - nested item ${n} with a [relative link](./docs/page-${n}.md)\n- insert and enhance the result\n\n`;
  s +=
    n % 2 === 0
      ? `\`\`\`ts\nexport function widget${n}(options: { depth: number; theme: string }): string {\n  const parts = [\`depth=\${options.depth}\`, \`theme=\${options.theme}\`];\n  return parts.join("&"); // ${n}\n}\n\`\`\`\n\n`
      : `\`\`\`python\ndef widget_${n}(depth: int = 3, theme: str = "light") -> dict:\n    """Section ${n}."""\n    return {"depth": depth, "theme": theme, "id": ${n}}\n\`\`\`\n\n`;
  if (n % 3 === 0) {
    s += `### Options for section ${n}\n\n| Option | Default | Meaning |\n| :----- | :-----: | ------: |\n| \`depth\` | ${n % 7} | how deep the outline goes |\n| \`theme\` | light | the colour scheme |\n\n`;
  }
  if (n % 8 === 0) s += `$$\n\\sum_{i=1}^{${n}} i = \\frac{${n}(${n}+1)}{2}\n$$\n\n`;
  if (n % 5 === 0) s += `> [!NOTE]\n> Section ${n} is generated. ${LOREM}\n\n`;
  if (n % 2 === 0) s += `[^n${n}]: Footnote for section ${n}.\n\n`;
  return s;
}

const diagram = (n: number) =>
  `\`\`\`mermaid\ngraph LR\n  A${n}[Read] --> B${n}[Parse] --> C${n}[Sanitise] --> D${n}[Enhance]\n  B${n} --> E${n}{Math?}\n\`\`\`\n\n`;

/** About `bytes` of Markdown with `diagrams` Mermaid fences. */
export function bigDocument(bytes: number, diagrams = 0): string {
  const parts = ["# Big document\n\n"];
  let size = parts[0].length;
  for (let n = 1; size < bytes; n++) {
    const s = section(n);
    parts.push(s);
    size += s.length;
  }
  const every = diagrams > 0 ? Math.max(1, Math.floor((parts.length - 1) / diagrams)) : 0;
  for (let i = 0; i < diagrams; i++) parts.splice(1 + i * (every + 1), 0, diagram(i + 1));
  return parts.join("");
}
