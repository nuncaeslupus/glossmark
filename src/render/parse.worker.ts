// Parses a large document off the UI thread: Markdown in, the pieces of HTML out. The HTML is
// sanitised on the UI thread, which has the DOM DOMPurify needs.
import { renderChunks } from "./pipeline";

export interface ParseRequest {
  id: number;
  source: string;
}

/** The pieces, or none when parsing threw: the UI thread then parses itself and reports it. */
export interface ParseResult {
  id: number;
  chunks: string[] | null;
}

const scope = self as unknown as {
  onmessage: (e: MessageEvent<ParseRequest>) => void;
  postMessage(result: ParseResult): void;
};

scope.onmessage = ({ data }) => {
  let chunks: string[] | null = null;
  try {
    chunks = renderChunks(data.source);
  } catch {}
  scope.postMessage({ id: data.id, chunks });
};
