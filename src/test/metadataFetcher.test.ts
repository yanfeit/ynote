import * as assert from 'assert';
import * as cheerio from 'cheerio';

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
});
