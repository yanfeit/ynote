import axios from 'axios';
import * as cheerio from 'cheerio';
import * as vscode from 'vscode';
import { Reading } from '../models/reading';

interface ExtractedMetadata {
  title: string;
  author: string;
  organization: string;
  abstract: string;
  source: string;
}

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) { return text; }
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export async function fetchMetadata(url: string): Promise<Partial<Reading>> {
  const config = vscode.workspace.getConfiguration('ynote');
  const timeout = config.get<number>('fetchTimeout', 10000);
  const maxAbstract = config.get<number>('maxAbstractLength', 500);
  const fallbackLen = config.get<number>('fallbackDescriptionLength', 100);
  const source = extractDomain(url);

  let html: string;
  try {
    const response = await axios.get(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; YNote/0.1; +https://github.com/yanfeit/ynote)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      maxRedirects: 5,
      responseType: 'text',
    });
    html = response.data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { url, source, title: url, author: '', organization: source, abstract: `Failed to fetch: ${message}` };
  }

  const $ = cheerio.load(html);
  const metadata = extractFromHtml($, maxAbstract, fallbackLen, source);

  return {
    url,
    title: metadata.title || url,
    author: metadata.author,
    organization: metadata.organization,
    abstract: metadata.abstract,
    source,
  };
}

function extractFromHtml(
  $: cheerio.CheerioAPI,
  maxAbstract: number,
  fallbackLen: number,
  source: string
): ExtractedMetadata {
  // Title extraction (priority order)
  const title =
    getMeta($, 'og:title') ||
    getMeta($, 'twitter:title') ||
    cleanText($('title').text()) ||
    '';

  // Author extraction
  const author =
    getMeta($, 'author') ||
    getMetaByName($, 'author') ||
    extractJsonLdField($, 'author') ||
    extractByline($) ||
    '';

  // Organization extraction
  const organization =
    getMeta($, 'og:site_name') ||
    extractJsonLdField($, 'publisher') ||
    source;

  // Abstract extraction
  let abstract =
    getMeta($, 'description') ||
    getMeta($, 'og:description') ||
    getMeta($, 'twitter:description') ||
    '';

  if (abstract) {
    abstract = truncate(cleanText(abstract), maxAbstract);
  } else {
    // Fallback: first meaningful paragraph text
    const paragraphs = $('article p, main p, .content p, .post p, p')
      .map((_i, el) => cleanText($(el).text()))
      .get()
      .filter((t: string) => t.length > 30);

    abstract = paragraphs.length > 0
      ? truncate(paragraphs[0], fallbackLen)
      : '';
  }

  return { title, author, organization, abstract, source };
}

function getMeta($: cheerio.CheerioAPI, property: string): string {
  const content =
    $(`meta[property="${property}"]`).attr('content') ||
    $(`meta[name="${property}"]`).attr('content') ||
    '';
  return cleanText(content);
}

function getMetaByName($: cheerio.CheerioAPI, name: string): string {
  return cleanText($(`meta[name="${name}"]`).attr('content') || '');
}

function extractJsonLdField($: cheerio.CheerioAPI, field: string): string {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const json = JSON.parse($(scripts[i]).html() || '');
      const data = Array.isArray(json) ? json[0] : json;

      if (field === 'author') {
        const author = data.author;
        if (typeof author === 'string') { return author; }
        if (author?.name) { return author.name; }
        if (Array.isArray(author) && author[0]?.name) { return author[0].name; }
      }

      if (field === 'publisher') {
        const publisher = data.publisher;
        if (typeof publisher === 'string') { return publisher; }
        if (publisher?.name) { return publisher.name; }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }
  return '';
}

function extractByline($: cheerio.CheerioAPI): string {
  const selectors = [
    '.author', '.byline', '[rel="author"]', '.post-author',
    '.article-author', '.entry-author',
  ];
  for (const sel of selectors) {
    const text = cleanText($(sel).first().text());
    if (text && text.length < 100) {
      return text.replace(/^by\s+/i, '');
    }
  }
  return '';
}
