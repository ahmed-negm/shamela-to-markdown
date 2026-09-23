/**
 * Converts a Shamela-exported .htm book file into a clean Markdown file.
 *
 * The Shamela export format wraps each printed page in a `div.PageText`
 * element. The first such element is a metadata block (author, publisher,
 * etc.) and the rest hold the actual book text, with section titles marked
 * as `span.title` and page/footnote clutter marked with dedicated classes.
 */
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

const ZERO_WIDTH_NON_JOINER = /\u200c/g;
const NBSP = /\xa0/g;
const GENERIC_HEADINGS = /^### (باب|مدخل|تابع)\s*$/gm;

const METADATA_LABELS = ['المؤلف', 'المحقق', 'الناشر', 'الطبعة'];

function cleanText(text: string): string {
  return text.replace(ZERO_WIDTH_NON_JOINER, '').replace(NBSP, ' ').replace(/\s+/g, ' ').trim();
}

/** Strips footnote-style refs (parens/brackets containing digits) from a metadata value. */
function cleanMetadataValue(value: string): string {
  return cleanText(value).replace(/[(\[][^()[\]]*\d[^()[\]]*[)\]]/g, '').trim();
}

function extractMetadata($: cheerio.CheerioAPI, firstBlock: cheerio.Cheerio<AnyNode>): Map<string, string> {
  const metadata = new Map<string, string>();
  firstBlock.find('p').each((_, p) => {
    const text = $(p).text();
    const colonIndex = text.indexOf(':');
    if (colonIndex === -1) return;
    const label = cleanText(text.slice(0, colonIndex));
    if (!METADATA_LABELS.includes(label)) return;
    metadata.set(label, cleanMetadataValue(text.slice(colonIndex + 1)));
  });
  return metadata;
}

/** A block is a leftover metadata dump (rather than real content) if it repeats the author line and has no section titles. */
function isMetadataDump($: cheerio.CheerioAPI, block: cheerio.Cheerio<AnyNode>): boolean {
  return block.find('span.title').length === 0 && block.text().includes('المؤلف:');
}

function convertBlockToLines($: cheerio.CheerioAPI, block: cheerio.Cheerio<AnyNode>): string[] {
  block.find('div.PageHead, hr, div.footnote, .footnote, .PageNumber').remove();

  const lines: string[] = [];
  let prevWasHeading = false;

  block.contents().each((_, node) => {
    if (node.type === 'tag' && node.name === 'span' && $(node).hasClass('title')) {
      const text = cleanText($(node).text());
      if (!text) return;
      lines.push('', `### ${text}`);
      prevWasHeading = true;
      return;
    }

    const text = cleanText(node.type === 'text' ? node.data : $(node).text());
    if (!text) return;
    if (prevWasHeading) lines.push('');
    lines.push(text);
    prevWasHeading = false;
  });

  return lines;
}

export function convertShamelaHtmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);

  const bookTitle = cleanText($('title').text()) || 'كتاب';
  $('script, style, head, meta, link').remove();

  const blocks = $('div.PageText');
  const metadata = blocks.length > 0 ? extractMetadata($, blocks.eq(0)) : new Map<string, string>();

  const lines: string[] = [`# ${bookTitle}`, '', '## بيانات الكتاب', ''];
  for (const label of METADATA_LABELS) {
    const value = metadata.get(label);
    if (value) lines.push(`- ${label}: ${value}`);
  }

  blocks.each((index, el) => {
    if (index === 0) return;
    const block = $(el);
    if (isMetadataDump($, block)) return;
    lines.push(...convertBlockToLines($, block));
  });

  let text = lines.join('\n');

  // Drop generic structural headings that add no information in Markdown.
  text = text.replace(GENERIC_HEADINGS, '');
  // The source uses footnote markers as inline digits; strip all digits.
  text = text.replace(/[0-9]/g, '');
  // Clean up artifacts left behind by digit removal (space-only, so newlines are preserved).
  const sp = '[^\\S\\r\\n]*';
  text = text.replace(new RegExp(`\\(${sp}ت${sp}هـ${sp}\\)`, 'g'), '');
  text = text.replace(new RegExp(`${sp}هـ${sp}-${sp}م${sp}`, 'g'), ' ');
  text = text.replace(new RegExp(`\\(${sp}\\)`, 'g'), '');
  text = text.replace(new RegExp(`\\[${sp}\\]`, 'g'), '');

  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/\n(#+ )/g, '\n\n$1');

  return text.trim() + '\n';
}
