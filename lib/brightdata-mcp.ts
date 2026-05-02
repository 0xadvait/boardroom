import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface BrightDataSearchResult {
  title: string;
  url: string;
  description?: string;
}

function brightDataToken(): string | undefined {
  return process.env.BRIGHTDATA_API_TOKEN ?? process.env.BRIGHT_DATA_API_TOKEN ?? process.env.API_TOKEN;
}

export function brightDataAvailable(): boolean {
  return Boolean(brightDataToken());
}

function brightDataServerArgs(): string[] {
  const configured = process.env.BRIGHTDATA_MCP_ARGS;
  if (!configured) {
    return ["@brightdata/mcp"];
  }
  return configured.split(/\s+/).filter(Boolean);
}

async function withBrightDataClient<T>(callback: (client: Client) => Promise<T>): Promise<T> {
  const token = brightDataToken();
  if (!token) {
    throw new Error("Bright Data MCP token is not configured. Set BRIGHTDATA_API_TOKEN for Team Manager.");
  }

  const transport = new StdioClientTransport({
    command: process.env.BRIGHTDATA_MCP_COMMAND ?? "npx",
    args: brightDataServerArgs(),
    env: {
      ...getDefaultEnvironment(),
      API_TOKEN: token,
      PRO_MODE: process.env.BRIGHTDATA_PRO_MODE ?? "true"
    },
    stderr: "pipe"
  });

  const client = new Client({ name: "team-manager-brightdata-client", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport, { timeout: 20_000 });

  try {
    return await callback(client);
  } finally {
    await client.close();
  }
}

function toolText(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content ?? [];
  return content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

export async function scrapeWithBrightData(url: string): Promise<string> {
  return withBrightDataClient(async (client) => {
    const result = await client.callTool(
      {
        name: "scrape_as_markdown",
        arguments: { url }
      },
      undefined,
      { timeout: 45_000, resetTimeoutOnProgress: true }
    );
    const text = toolText(result);
    if (!text) {
      throw new Error("Bright Data scrape returned no text.");
    }
    return text;
  });
}

function parseSearchJson(text: string): BrightDataSearchResult[] {
  const parsed = JSON.parse(text) as { organic?: Array<{ link?: string; title?: string; description?: string }> };
  return (parsed.organic ?? [])
    .filter((item) => item.link && item.title)
    .map((item) => ({
      title: item.title ?? item.link ?? "Untitled source",
      url: item.link ?? "",
      description: item.description
    }));
}

function parseSearchMarkdown(text: string): BrightDataSearchResult[] {
  const markdownLinks = Array.from(text.matchAll(/\[([^\]]{3,140})\]\((https?:\/\/[^)\s]+)\)/g)).map((match) => ({
    title: match[1].trim(),
    url: match[2].trim()
  }));

  if (markdownLinks.length > 0) {
    return markdownLinks;
  }

  return Array.from(text.matchAll(/https?:\/\/[^\s)]+/g)).map((match, index) => ({
    title: `Search result ${index + 1}`,
    url: match[0]
  }));
}

function parseSearchResults(text: string): BrightDataSearchResult[] {
  try {
    return parseSearchJson(text);
  } catch {
    return parseSearchMarkdown(text);
  }
}

export async function searchWithBrightData(options: {
  query: string;
  engine?: "google" | "bing" | "yandex";
  geoLocation?: string;
  maxResults?: number;
}): Promise<BrightDataSearchResult[]> {
  return withBrightDataClient(async (client) => {
    const result = await client.callTool(
      {
        name: "search_engine",
        arguments: {
          query: options.query,
          engine: options.engine ?? "google",
          geo_location: options.geoLocation ?? "us"
        }
      },
      undefined,
      { timeout: 35_000, resetTimeoutOnProgress: true }
    );

    const text = toolText(result);
    if (!text) {
      throw new Error("Bright Data search returned no text.");
    }

    const seen = new Set<string>();
    return parseSearchResults(text)
      .filter((item) => {
        if (!item.url || seen.has(item.url)) {
          return false;
        }
        seen.add(item.url);
        return true;
      })
      .slice(0, options.maxResults ?? 8);
  });
}
