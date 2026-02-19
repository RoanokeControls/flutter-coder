// HTTP fetch helpers with timeout, error handling, and HTML-to-text extraction

const DEFAULT_TIMEOUT_MS = 10_000;

export interface FetchOptions {
  readonly timeoutMs?: number;
  readonly headers?: Record<string, string>;
}

export async function fetchJson<T>(url: string, opts?: FetchOptions): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        ...opts?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms for ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "text/html, text/plain",
        ...opts?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms for ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract readable text from HTML by stripping tags and normalizing whitespace.
 * Lightweight alternative to a full HTML parser.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract content from a specific HTML section by id or class.
 * Returns the inner HTML of the first matching element.
 */
export function extractSection(html: string, selector: string): string | undefined {
  // Match by id
  const idPattern = new RegExp(
    `<[^>]+id=["']${selector}["'][^>]*>([\\s\\S]*?)(?=<\\/(?:div|section|article|main))`,
    "i"
  );
  const idMatch = html.match(idPattern);
  if (idMatch) return idMatch[1];

  // Match by class
  const classPattern = new RegExp(
    `<[^>]+class=["'][^"']*${selector}[^"']*["'][^>]*>([\\s\\S]*?)(?=<\\/(?:div|section|article|main))`,
    "i"
  );
  const classMatch = html.match(classPattern);
  if (classMatch) return classMatch[1];

  return undefined;
}
