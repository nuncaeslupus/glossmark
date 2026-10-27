import spec from "commonmark-spec";
import { expect, test } from "vitest";
import { commonmark } from "./pipeline";

// The spec writes tabs as →. Like the spec's own runner, ignore a newline between two tags:
// markdown-it prints an empty blockquote as `<blockquote></blockquote>` (examples 218, 239, 240).
// ponytail: newline-between-tags only, not the full normalize.py; widen if a real mismatch hides here.
const tabs = (s: string) => s.replace(/→/g, "\t");
const normalise = (html: string) => tabs(html).replace(/>\n</g, "><");

test("test_commonmark_spec_all_examples_match", () => {
  const failed = spec.tests
    .filter((t) => normalise(commonmark.render(tabs(t.markdown))) !== normalise(t.html))
    .map((t) => t.number);
  expect(spec.tests.length).toBeGreaterThan(600);
  expect(failed).toEqual([]);
});
