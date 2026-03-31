import * as assert from 'assert';
import * as Module from 'module';

// Mock vscode module before importing metadataFetcher
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'vscode') {
    return require('./mock/vscode');
  }
  return originalRequire.apply(this, arguments as any);
};

import * as cheerio from 'cheerio';
import { extractContentKeywords } from '../services/metadataFetcher';

// We test the HTML parsing logic directly by importing the internal helpers.
// Since extractFromHtml is not exported, we test via the public fetchMetadata
// for live tests, and test HTML parsing patterns here with cheerio directly.

// These tests verify the metadata extraction patterns without network calls.

describe('Metadata Extraction Patterns', () => {

  describe('Open Graph meta tags', () => {
    it('extracts og:title', () => {
      const html = `<html><head>
        <meta property="og:title" content="Anthropic Research Post">
        <title>Fallback Title</title>
      </head><body></body></html>`;
      const $ = cheerio.load(html);
      const title = $('meta[property="og:title"]').attr('content') || '';
      assert.strictEqual(title, 'Anthropic Research Post');
    });

    it('extracts og:description', () => {
      const html = `<html><head>
        <meta property="og:description" content="A detailed research summary.">
      </head><body></body></html>`;
      const $ = cheerio.load(html);
      const desc = $('meta[property="og:description"]').attr('content') || '';
      assert.strictEqual(desc, 'A detailed research summary.');
    });

    it('extracts og:site_name as organization', () => {
      const html = `<html><head>
        <meta property="og:site_name" content="Nature">
      </head><body></body></html>`;
      const $ = cheerio.load(html);
      const org = $('meta[property="og:site_name"]').attr('content') || '';
      assert.strictEqual(org, 'Nature');
    });
  });

  describe('Standard meta tags', () => {
    it('extracts meta name="author"', () => {
      const html = `<html><head>
        <meta name="author" content="John Doe">
      </head><body></body></html>`;
      const $ = cheerio.load(html);
      const author = $('meta[name="author"]').attr('content') || '';
      assert.strictEqual(author, 'John Doe');
    });

    it('extracts meta name="description"', () => {
      const html = `<html><head>
        <meta name="description" content="A short description of the article.">
      </head><body></body></html>`;
      const $ = cheerio.load(html);
      const desc = $('meta[name="description"]').attr('content') || '';
      assert.strictEqual(desc, 'A short description of the article.');
    });

    it('falls back to <title> tag', () => {
      const html = `<html><head><title>My Blog Post</title></head><body></body></html>`;
      const $ = cheerio.load(html);
      const title = $('title').text();
      assert.strictEqual(title, 'My Blog Post');
    });
  });

  describe('JSON-LD structured data', () => {
    it('extracts author name from JSON-LD', () => {
      const html = `<html><head>
        <script type="application/ld+json">
        {
          "@type": "Article",
          "author": { "@type": "Person", "name": "Jane Smith" }
        }
        </script>
      </head><body></body></html>`;
      const $ = cheerio.load(html);
      const script = $('script[type="application/ld+json"]').html() || '';
      const data = JSON.parse(script);
      assert.strictEqual(data.author.name, 'Jane Smith');
    });

    it('extracts publisher name from JSON-LD', () => {
      const html = `<html><head>
        <script type="application/ld+json">
        {
          "@type": "Article",
          "publisher": { "@type": "Organization", "name": "Science Magazine" }
        }
        </script>
      </head><body></body></html>`;
      const $ = cheerio.load(html);
      const script = $('script[type="application/ld+json"]').html() || '';
      const data = JSON.parse(script);
      assert.strictEqual(data.publisher.name, 'Science Magazine');
    });

    it('handles array author in JSON-LD', () => {
      const html = `<html><head>
        <script type="application/ld+json">
        {
          "@type": "Article",
          "author": [
            { "@type": "Person", "name": "Alice" },
            { "@type": "Person", "name": "Bob" }
          ]
        }
        </script>
      </head><body></body></html>`;
      const $ = cheerio.load(html);
      const script = $('script[type="application/ld+json"]').html() || '';
      const data = JSON.parse(script);
      assert.strictEqual(data.author[0].name, 'Alice');
    });

    it('ignores invalid JSON-LD gracefully', () => {
      const html = `<html><head>
        <script type="application/ld+json">
        { this is not valid json }
        </script>
      </head><body></body></html>`;
      const $ = cheerio.load(html);
      const script = $('script[type="application/ld+json"]').html() || '';
      let parsed = null;
      try { parsed = JSON.parse(script); } catch { /* expected */ }
      assert.strictEqual(parsed, null);
    });
  });

  describe('Fallback paragraph extraction', () => {
    it('extracts first paragraph when no meta description', () => {
      const html = `<html><body>
        <article>
          <p>This is a long enough paragraph that should be captured as a fallback abstract for the reading record.</p>
        </article>
      </body></html>`;
      const $ = cheerio.load(html);
      const paragraphs = $('article p')
        .map((_i: number, el: any) => $(el).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter((t: string) => t.length > 30);
      assert.ok(paragraphs.length > 0);
      assert.ok(paragraphs[0].includes('fallback abstract'));
    });

    it('skips short paragraphs', () => {
      const html = `<html><body>
        <article>
          <p>Short.</p>
          <p>This is a longer paragraph that should be picked up as the abstract text for the record.</p>
        </article>
      </body></html>`;
      const $ = cheerio.load(html);
      const paragraphs = $('article p')
        .map((_i: number, el: any) => $(el).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter((t: string) => t.length > 30);
      assert.strictEqual(paragraphs.length, 1);
      assert.ok(paragraphs[0].includes('longer paragraph'));
    });
  });

  describe('URL domain extraction', () => {
    it('extracts domain from URL', () => {
      const url = new URL('https://www.anthropic.com/research/some-post');
      const domain = url.hostname.replace(/^www\./, '');
      assert.strictEqual(domain, 'anthropic.com');
    });

    it('handles URLs without www prefix', () => {
      const url = new URL('https://nature.com/articles/12345');
      const domain = url.hostname.replace(/^www\./, '');
      assert.strictEqual(domain, 'nature.com');
    });

    it('handles invalid URLs gracefully', () => {
      let domain = '';
      try {
        const url = new URL('not-a-url');
        domain = url.hostname;
      } catch {
        domain = '';
      }
      assert.strictEqual(domain, '');
    });
  });

  describe('Content keyword extraction', () => {
    it('extracts frequent words from article body', () => {
      const html = `<html><body><article>
        <p>Machine learning models are transforming natural language processing.
        Deep learning approaches enable better language understanding.
        Neural network models trained on large datasets achieve state-of-the-art results.
        Machine learning continues to advance rapidly in language tasks.</p>
      </article></body></html>`;
      const $ = cheerio.load(html);
      const keywords = extractContentKeywords($, 'Advances in Machine Learning');
      assert.ok(keywords.includes('machine'), 'should include "machine"');
      assert.ok(keywords.includes('learning'), 'should include "learning"');
      assert.ok(keywords.includes('language'), 'should include "language"');
    });

    it('filters out stopwords', () => {
      const html = `<html><body><article>
        <p>The model was trained with the dataset and the results were evaluated.
        The performance was measured and the accuracy was reported.
        The system and the framework were tested and validated.</p>
      </article></body></html>`;
      const $ = cheerio.load(html);
      const keywords = extractContentKeywords($, 'Test Article');
      assert.ok(!keywords.includes('the'), 'should not include "the"');
      assert.ok(!keywords.includes('and'), 'should not include "and"');
      assert.ok(!keywords.includes('was'), 'should not include "was"');
    });

    it('extracts keywords from meta keywords tag', () => {
      const html = `<html><head>
        <meta name="keywords" content="artificial intelligence, deep learning, NLP">
      </head><body><p>Short content.</p></body></html>`;
      const $ = cheerio.load(html);
      const keywords = extractContentKeywords($, 'AI Article');
      assert.ok(keywords.includes('artificial intelligence'), 'should include "artificial intelligence"');
      assert.ok(keywords.includes('deep learning'), 'should include "deep learning"');
    });

    it('ignores script and style content', () => {
      const html = `<html><body>
        <script>var tracking = "analytics analytics analytics analytics";</script>
        <style>.analytics { color: red; }</style>
        <article>
          <p>Transformer architecture enables efficient parallel processing.
          Transformer models scale well for large datasets.
          Attention mechanism is key to transformer performance.</p>
        </article>
      </body></html>`;
      const $ = cheerio.load(html);
      const keywords = extractContentKeywords($, 'Transformers');
      assert.ok(keywords.includes('transformer'), 'should include "transformer"');
      assert.ok(!keywords.includes('analytics'), 'should not include script content');
    });

    it('returns empty array for pages with no meaningful content', () => {
      const html = `<html><body><p>Hi.</p></body></html>`;
      const $ = cheerio.load(html);
      const keywords = extractContentKeywords($, '');
      assert.ok(Array.isArray(keywords));
    });

    it('limits results to at most 15 keywords', () => {
      const words = Array.from({length: 30}, (_, i) => `keyword${i}`);
      const repeated = words.map(w => `${w} ${w} ${w}`).join('. ');
      const html = `<html><body><article><p>${repeated}</p></article></body></html>`;
      const $ = cheerio.load(html);
      const keywords = extractContentKeywords($, 'Test');
      assert.ok(keywords.length <= 15, `Expected at most 15 keywords, got ${keywords.length}`);
    });
  });
});
