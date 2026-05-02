import type { SourceEvidence, SourceRef } from "./types";
import { pseudoEmbedding } from "./scoring";

export interface FetchedSource extends SourceRef {
  status: "fetched" | "failed";
  fetchedAt: string;
  contentLength: number;
  excerpt: string;
  evidence: SourceEvidence[];
  textHash: string;
}

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

function genericEvidence(source: SourceRef, text: string, query: string): SourceEvidence[] {
  const tokens = queryTokens(`${query} ${source.title} ${source.note}`);
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 80);

  const candidates = sentences.map((sentence) => {
    const lower = sentence.toLowerCase();
    const score = tokens.reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0);
    return { sentence, score };
  });

  const ranked = candidates
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const fallback = ranked.length > 0 ? ranked : sentences.slice(0, 3).map((sentence) => ({ sentence, score: 1 }));

  return fallback.map((candidate, index) => ({
    label: `generic_${index + 1}`,
    snippet: candidate.sentence.length > 340 ? `${candidate.sentence.slice(0, 337).trim()}...` : candidate.sentence,
    confidence: Math.min(0.84, 0.55 + candidate.score * 0.08)
  }));
}

function extractEvidence(source: SourceRef, text: string, query = ""): SourceEvidence[] {
  return genericEvidence(source, text, query);
}

export async function fetchSources(sources: SourceRef[], query = ""): Promise<FetchedSource[]> {
  return Promise.all(
    sources.map(async (source) => {
      const fetchedAt = new Date().toISOString();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(source.url, {
          signal: controller.signal,
          cache: "no-store",
          headers: {
            "user-agent": "TeamManager-MCP-Hackathon-Demo/1.0"
          }
        });
        const html = await response.text();
        const text = normalizeHtml(html);
        const evidence = extractEvidence(source, text, query);

        return {
          ...source,
          status: "fetched",
          fetchedAt,
          contentLength: text.length,
          excerpt: text.slice(0, 700),
          evidence,
          textHash: stableHash(text)
        };
      } catch (error) {
        return {
          ...source,
          status: "failed",
          fetchedAt,
          contentLength: 0,
          excerpt: "",
          evidence: [],
          textHash: "fetch-failed",
          error: error instanceof Error ? error.message : String(error)
        };
      } finally {
        clearTimeout(timeout);
      }
    })
  );
}

export function sourceDocument(source: FetchedSource, runId: string, taskId: string) {
  const evidenceText = source.evidence.map((item) => `${item.label}: ${item.snippet}`).join("\n");
  return {
    _id: `${runId}-${source.id}`,
    demo_run_id: runId,
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
