import type { SourceEvidence, SourceRef } from "./types";
import { pseudoEmbedding } from "./scoring";
import { brightDataAvailable, scrapeWithBrightData } from "./brightdata-mcp";

export interface FetchedSource extends SourceRef {
  status: "fetched" | "failed";
  fetchedAt: string;
  contentLength: number;
  excerpt: string;
  evidence: SourceEvidence[];
  textHash: string;
  extractionProvider: "provided_text" | "native_fetch" | "brightdata_mcp";
  extractionWarnings?: string[];
}

export type SourceExtractionMode = "auto" | "native" | "brightdata";

function normalizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 1200);
  if (sample.includes("%PDF-") || sample.includes("\u0000")) {
    return true;
  }
  const suspicious = Array.from(sample).filter((char) => char === "\uFFFD" || char.charCodeAt(0) < 8).length;
  return sample.length > 0 && suspicious / sample.length > 0.02;
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const STOPWORDS = new Set([
  "about",
  "after",
  "against",
  "between",
  "company",
  "could",
  "evaluate",
  "from",
  "getting",
  "have",
  "listed",
  "should",
  "their",
  "there",
  "these",
  "this",
  "want",
  "whether",
  "with",
  "would",
  "your"
]);

function queryTokens(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
    )
  ).slice(0, 18);
}

function cleanForEvidence(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function boilerplatePenalty(chunk: string): number {
  const lower = chunk.toLowerCase();
  const boilerplateSignals = [
    "sign in",
    "sign up",
    "create your account",
    "cookie",
    "privacy",
    "skip to content",
    "footer",
    "all rights reserved",
    "learn more",
    "contact us"
  ].filter((signal) => lower.includes(signal)).length;
  const linkishRatio = (chunk.match(/\]\(|\[/g) ?? []).length / Math.max(1, chunk.length / 80);
  return boilerplateSignals * 1.5 + linkishRatio;
}

function evidenceChunks(text: string): string[] {
  const cleaned = cleanForEvidence(text);
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length >= 80 && chunk.length <= 1200);

  if (paragraphs.length > 0) {
    return paragraphs;
  }

  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 80 && sentence.length <= 1200);
}

function genericEvidence(
  source: SourceRef,
  text: string,
  query: string,
  provider: "provided_text" | "native_fetch" | "brightdata_mcp"
): SourceEvidence[] {
  const tokens = queryTokens(`${query} ${source.title} ${source.note}`);
  const chunks = evidenceChunks(text);

  const candidates = chunks.map((chunk) => {
    const lower = chunk.toLowerCase();
    const tokenScore = tokens.reduce((sum, token) => {
      const occurrences = lower.split(token).length - 1;
      return sum + Math.min(2, occurrences);
    }, 0);
    const numericBonus = /\b\d{4}\b|%|\$|£|\bday(s)?\b|\bweek(s)?\b|\bmonth(s)?\b/i.test(chunk) ? 0.4 : 0;
    const score = tokenScore + numericBonus - boilerplatePenalty(chunk);
    return { chunk, score };
  });

  const ranked = candidates
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const fallback =
    ranked.length > 0
      ? ranked
      : chunks
          .sort((left, right) => boilerplatePenalty(left) - boilerplatePenalty(right))
          .slice(0, 3)
          .map((chunk) => ({ chunk, score: 1 }));

  return fallback.map((candidate, index) => ({
    label: `generic_${index + 1}`,
    snippet: candidate.chunk.length > 340 ? `${candidate.chunk.slice(0, 337).trim()}...` : candidate.chunk,
    confidence: Math.min(0.84, 0.55 + candidate.score * 0.08),
    provider
  }));
}

function extractEvidence(
  source: SourceRef,
  text: string,
  query = "",
  provider: "provided_text" | "native_fetch" | "brightdata_mcp"
): SourceEvidence[] {
  return genericEvidence(source, text, query, provider);
}

function fetchedFromText(
  source: SourceRef,
  text: string,
  query: string,
  provider: "provided_text" | "native_fetch" | "brightdata_mcp",
  fetchedAt: string,
  warnings: string[] = []
): FetchedSource {
  const normalized = normalizeText(text);
  const evidence = extractEvidence(source, normalized, query, provider);

  return {
    ...source,
    status: "fetched",
    fetchedAt,
    contentLength: normalized.length,
    excerpt: normalized.slice(0, 700),
    evidence,
    textHash: stableHash(normalized),
    extractionProvider: provider,
    extractionWarnings: warnings
  };
}

function failedSource(
  source: SourceRef,
  fetchedAt: string,
  error: string,
  provider: "provided_text" | "native_fetch" | "brightdata_mcp",
  warnings: string[] = []
): FetchedSource {
  return {
    ...source,
    status: "failed",
    fetchedAt,
    contentLength: 0,
    excerpt: "",
    evidence: [],
    textHash: "fetch-failed",
    error,
    extractionProvider: provider,
    extractionWarnings: warnings
  };
}

function thinExtraction(source: FetchedSource): boolean {
  const lowerExcerpt = source.excerpt.toLowerCase();
  return (
    source.status === "failed" ||
    source.evidence.length === 0 ||
    source.contentLength < 500 ||
    lowerExcerpt.includes("enable javascript") ||
    lowerExcerpt.includes("please enable cookies") ||
    lowerExcerpt.includes("%pdf") ||
    lowerExcerpt.includes("403 forbidden")
  );
}

async function fetchNative(source: SourceRef, query: string, fetchedAt: string): Promise<FetchedSource> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "user-agent": "TeamManager-MCP/0.1"
      }
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf")) {
      return failedSource(source, fetchedAt, "Native fetch does not decode PDF content.", "native_fetch", [
        "native_pdf_unsupported"
      ]);
    }

    const html = await response.text();
    const text = normalizeHtml(html);
    if (looksBinary(text)) {
      return failedSource(source, fetchedAt, "Native fetch returned binary or undecoded document content.", "native_fetch", [
        "native_binary_unsupported"
      ]);
    }
    return fetchedFromText(source, text, query, "native_fetch", fetchedAt);
  } catch (error) {
    return failedSource(source, fetchedAt, error instanceof Error ? error.message : String(error), "native_fetch");
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBrightData(source: SourceRef, query: string, fetchedAt: string, warnings: string[] = []): Promise<FetchedSource> {
  try {
    const markdown = await scrapeWithBrightData(source.url);
    return fetchedFromText(source, markdown, query, "brightdata_mcp", fetchedAt, warnings);
  } catch (error) {
    return failedSource(source, fetchedAt, error instanceof Error ? error.message : String(error), "brightdata_mcp", warnings);
  }
}

export async function fetchSources(
  sources: SourceRef[],
  query = "",
  options: { mode?: SourceExtractionMode; fallbackToNative?: boolean } = {}
): Promise<FetchedSource[]> {
  const mode = options.mode ?? "auto";
  const fallbackToNative = options.fallbackToNative ?? true;

  return Promise.all(
    sources.map(async (source) => {
      const fetchedAt = new Date().toISOString();

      if (source.providedText?.trim()) {
        return fetchedFromText(source, source.providedText, query, "provided_text", fetchedAt);
      }

      if (mode === "brightdata") {
        const bright = await fetchBrightData(source, query, fetchedAt);
        if (bright.status === "fetched" || !fallbackToNative) {
          return bright;
        }
        return fetchNative(source, query, fetchedAt);
      }

      const native = await fetchNative(source, query, fetchedAt);
      if (mode === "native" || !thinExtraction(native) || !brightDataAvailable()) {
        if (mode === "auto" && thinExtraction(native) && !brightDataAvailable()) {
          return {
            ...native,
            extractionWarnings: [...(native.extractionWarnings ?? []), "brightdata_not_configured_for_thin_source"]
          };
        }
        return native;
      }

      const bright = await fetchBrightData(source, query, fetchedAt, [
        `native_fetch_thin:${native.error ?? `${native.evidence.length}_evidence_${native.contentLength}_chars`}`
      ]);
      return bright.status === "fetched" ? bright : native;
    })
  );
}

export function sourceDocument(source: FetchedSource, runId: string, taskId: string) {
  const evidenceText = source.evidence.map((item) => `${item.label}: ${item.snippet}`).join("\n");
  return {
    _id: `${runId}-${source.id}`,
    room_run_id: runId,
    task_id: taskId,
    source_id: source.id,
    title: source.title,
    url: source.url,
    status: source.status,
    fetched_at: new Date(source.fetchedAt),
    content_length: source.contentLength,
    text_hash: source.textHash,
    excerpt: source.excerpt,
    evidence: source.evidence,
    evidence_embedding: pseudoEmbedding(`${source.title}\n${evidenceText || source.excerpt}`),
    extraction_provider: source.extractionProvider,
    extraction_warnings: source.extractionWarnings ?? [],
    error: source.error
  };
}

export function evidenceSnippet(source: SourceRef | undefined, label: string): string {
  const snippet = source?.evidence?.find((item) => item.label === label)?.snippet;
  if (!snippet) {
    return source?.note ?? "Live source was unavailable during this step.";
  }
  return snippet;
}

export function shortEvidence(source: SourceRef | undefined, label: string, maxLength = 210): string {
  const snippet = evidenceSnippet(source, label);
  return snippet.length <= maxLength ? snippet : `${snippet.slice(0, maxLength - 1).trim()}...`;
}
