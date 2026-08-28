import assert from "node:assert/strict";
import { test } from "node:test";
import { MarkdownParser } from "../dist/ui/formatting/markdown-parser.js";

test("MarkdownParser parses GitHub-style tables", () => {
  assert.deepEqual(
    new MarkdownParser().parse([
      "| Feature | Supported |",
      "|:--------|:---------:|",
      "| Headers | ✅ |",
      "| Lists | **✅** |",
    ].join("\n")),
    [{
      type: "table",
      headers: ["Feature", "Supported"],
      alignments: ["left", "center"],
      rows: [["Headers", "✅"], ["Lists", "**✅**"]],
    }],
  );
});
