import spec from "commonmark-spec";
import { expect, test } from "vitest";
import examples from "./gfm-spec.json";
import { render } from "./pipeline";

// gfm-spec.json: the examples of the "(extension)" sections of github/cmark-gfm's
// test/spec.txt (GFM 0.29-gfm), extracted verbatim. Tabs are written as →, as in the spec.
const tabs = (s: string) => s.replace(/→/g, "\t");

test("test_gfm_extension_examples_all_match", () => {
  const failed = examples
    .filter((e) => render(tabs(e.markdown)) !== tabs(e.html))
    .map((e) => `${e.example} ${e.section}`);
  expect(examples.length).toBe(24);
  expect(failed).toEqual([]);
});

// Where GFM deliberately departs from CommonMark, as cmark-gfm does with its extensions on:
// the tag filter (raw <script>, <style>, <textarea>) and extended autolinks. Nothing else.
test("test_gfm_departs_from_commonmark_only_where_specified", () => {
  const normalise = (html: string) => tabs(html).replace(/>\n</g, "><");
  const differ = spec.tests
    .filter((t) => normalise(render(tabs(t.markdown))) !== normalise(t.html))
    .map((t) => t.number);
  expect(differ).toEqual([170, 171, 172, 173, 176, 178, 608, 611, 612]);
});
