/**
 * Looks things up on the LOTR wiki through its public API (the documented way
 * for web pages: anonymous requests with `origin=*`). Only text, links and the
 * name of a page's main picture are fetched - never the pictures themselves.
 */
const WIKI = 'https://lotr.fandom.com';
const API = `${WIKI}/api.php`;

export interface WikiInfo {
  title: string;
  url: string;
  /** The opening paragraph of the page, as plain text. */
  summary?: string;
  /** Page of the article's main picture, to be used as a "suggested picture" link. */
  suggestedPicture?: string;
}

async function call(params: Record<string, string>): Promise<unknown> {
  const query = new URLSearchParams({ format: 'json', origin: '*', ...params });
  const res = await fetch(`${API}?${query}`);
  if (!res.ok) throw new Error(`The wiki answered with an error (${res.status}).`);
  return res.json();
}

/** Titles of wiki pages starting with or matching the text. */
export async function searchWiki(text: string): Promise<string[]> {
  if (text.trim().length < 2) return [];
  const data = (await call({ action: 'opensearch', limit: '8', search: text.trim() })) as [string, string[]];
  return data[1] ?? [];
}

/** Accepts a page title or a wiki address and returns the title. */
export function titleFromInput(input: string): string {
  const match = /fandom\.com\/wiki\/([^?#]+)/.exec(input);
  return (match ? decodeURIComponent(match[1]) : input).replaceAll('_', ' ').trim();
}

/** Picks the first real paragraph out of the page's opening section. */
export function firstParagraph(html: string): string | undefined {
  const page = new DOMParser().parseFromString(html, 'text/html');
  page.querySelectorAll('aside, table, figure, sup, style, script, .mw-editsection, .noprint, dl').forEach((node) => node.remove());
  for (const paragraph of page.querySelectorAll('p')) {
    const text = (paragraph.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < 80) continue;
    if (text.length <= 600) return text;
    // too long: cut at the end of a sentence
    const cut = text.slice(0, 600);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    return end > 200 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
  }
  return undefined;
}

export async function wikiPage(input: string): Promise<WikiInfo> {
  const wanted = titleFromInput(input);
  const info = (await call({ action: 'query', redirects: '1', prop: 'info|pageimages', inprop: 'url', piprop: 'name', titles: wanted })) as {
    query?: { pages?: Record<string, { title: string; fullurl?: string; pageimage?: string; missing?: string }> };
  };
  const page = Object.values(info.query?.pages ?? {})[0];
  if (!page || page.missing !== undefined || !page.fullurl) throw new Error(`The wiki has no page called "${wanted}".`);

  let summary: string | undefined;
  try {
    const parsed = (await call({ action: 'parse', redirects: '1', prop: 'text', section: '0', page: page.title })) as { parse?: { text?: { '*'?: string } } };
    summary = firstParagraph(parsed.parse?.text?.['*'] ?? '');
  } catch {
    summary = undefined; // the link alone is still useful
  }
  return {
    title: page.title,
    url: page.fullurl,
    summary,
    suggestedPicture: page.pageimage ? `${WIKI}/wiki/File:${encodeURIComponent(page.pageimage)}` : undefined,
  };
}
