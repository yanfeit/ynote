import type { CheerioAPI } from 'cheerio';
import * as vscode from 'vscode';
import { Reading } from '../models/reading';

interface ExtractedMetadata {
  title: string;
  author: string;
  organization: string;
  abstract: string;
  source: string;
  suggestedTags: string[];
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

export interface FetchResult {
  metadata: Partial<Reading>;
  suggestedTags: string[];
}

export async function fetchMetadata(url: string): Promise<FetchResult> {
  // Lazy-load heavy dependencies (only when actually fetching, not on extension activation)
  const { default: axios } = await import('axios');
  const cheerio = await import('cheerio');

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
    let userMessage: string;
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        userMessage = `Request timed out after ${timeout / 1000}s. The site may be slow or unreachable.`;
      } else if (err.code === 'ENOTFOUND') {
        userMessage = `Could not resolve hostname. Check the URL or your network connection.`;
      } else if (err.code === 'ECONNREFUSED') {
        userMessage = `Connection refused by the server.`;
      } else if (err.code === 'ECONNRESET') {
        userMessage = `Connection was reset. The server may have dropped the connection.`;
      } else if (err.response) {
        userMessage = `Server returned HTTP ${err.response.status} (${err.response.statusText || 'error'}).`;
      } else {
        userMessage = err.message;
      }
    } else {
      userMessage = err instanceof Error ? err.message : String(err);
    }
    throw new Error(userMessage);
  }

  const $ = cheerio.load(html);
  const metadata = extractFromHtml($, maxAbstract, fallbackLen, source);

  return {
    metadata: {
      url,
      title: metadata.title || url,
      author: metadata.author,
      organization: metadata.organization,
      abstract: metadata.abstract,
      source,
    },
    suggestedTags: metadata.suggestedTags,
  };
}

function extractFromHtml(
  $: CheerioAPI,
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

  return { title, author, organization, abstract, source, suggestedTags: extractContentKeywords($, title) };
}

function getMeta($: CheerioAPI, property: string): string {
  const content =
    $(`meta[property="${property}"]`).attr('content') ||
    $(`meta[name="${property}"]`).attr('content') ||
    '';
  return cleanText(content);
}

function getMetaByName($: CheerioAPI, name: string): string {
  return cleanText($(`meta[name="${name}"]`).attr('content') || '');
}

function extractJsonLdField($: CheerioAPI, field: string): string {
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

function extractByline($: CheerioAPI): string {
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

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'has',
  'how', 'what', 'why', 'new', 'you', 'your', 'our', 'their', 'its', 'can',
  'will', 'not', 'but', 'all', 'more', 'also', 'been', 'have', 'had', 'were',
  'which', 'when', 'where', 'who', 'than', 'then', 'them', 'they', 'these',
  'those', 'other', 'into', 'about', 'would', 'could', 'should', 'does',
  'did', 'just', 'only', 'some', 'such', 'each', 'very', 'much', 'most',
  'well', 'here', 'there', 'both', 'between', 'after', 'before', 'over',
  'under', 'through', 'during', 'while', 'being', 'same', 'make', 'like',
  'use', 'used', 'using', 'one', 'two', 'first', 'last', 'even', 'may',
  'many', 'any', 'own', 'get', 'set', 'out', 'way', 'need', 'see', 'part',
  'take', 'come', 'want', 'let', 'say', 'know', 'work', 'still', 'back',
  'made', 'find', 'give', 'look', 'help', 'tell', 'keep', 'think', 'show',
  'try', 'ask', 'call', 'turn', 'hand', 'said', 'able', 'read', 'must',
  'open', 'however', 'without', 'since', 'because', 'against', 'around',
  'end', 'per', 'based', 'given', 'upon', 'different', 'every', 'another',
]);

export function extractContentKeywords($: CheerioAPI, title: string): string[] {
  // Remove non-content elements
  const clone = $.root().clone();
  clone.find('script, style, nav, footer, header, aside, .sidebar, .menu, .nav, .footer, .header, .advertisement, .ad').remove();

  // Extract text from article body, main content, or full body
  let bodyText = '';
  const contentSelectors = ['article', 'main', '.content', '.post-content', '.article-body', '.entry-content'];
  for (const sel of contentSelectors) {
    const text = cleanText(clone.find(sel).text());
    if (text.length > 100) {
      bodyText = text;
      break;
    }
  }
  if (!bodyText) {
    bodyText = cleanText(clone.find('body').text());
  }

  // Also extract keywords from meta tags
  const metaKeywords = (
    $('meta[name="keywords"]').attr('content') ||
    $('meta[name="news_keywords"]').attr('content') ||
    ''
  );

  // Combine title + body + meta keywords
  const combinedText = `${title} ${title} ${metaKeywords} ${bodyText}`.toLowerCase();

  // Tokenize: split on non-alphanumeric (keep hyphens within words)
  const words = combinedText
    .split(/[^a-z0-9\-]+/)
    .filter(w => w.length > 2 && w.length < 30)
    .filter(w => !STOP_WORDS.has(w))
    .filter(w => !/^\d+$/.test(w)); // exclude pure numbers

  // Count frequencies
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  // Sort by frequency, take top keywords that appear at least twice
  const sorted = [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  // Also add meta keywords split by comma
  if (metaKeywords) {
    const metaTags = metaKeywords.split(/[,;]+/).map(t => t.trim().toLowerCase()).filter(t => t.length > 1 && t.length < 30);
    for (const tag of metaTags) {
      if (!sorted.includes(tag)) {
        sorted.push(tag);
      }
    }
  }

  return sorted.slice(0, 15);
}
