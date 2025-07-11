import type { RootContent } from 'mdast';
import { remark } from 'remark';
import type { Plugin, Transformer } from 'unified';
import { logger } from '../../../logger';
import { coerceNumber } from '../../../util/number';
import { regEx } from '../../../util/regex';

interface UrlMatch {
  start: number;
  end: number;
  replaceTo: string;
}

//according to https://github.com/dead-claudia/github-limits
const urlRegex =
  /(?:https?:)?(?:\/\/)?(?:www\.)?(?<!api\.)(?:to)?github\.com\/[-a-z0-9]+\/[-_a-z0-9.]+\/(?:discussions|issues|pull)\/[0-9]+(?:#[-_a-z0-9]+)?/i; // TODO #12872 (?<!re) after text not matching

function massageLink(input: string): string {
  return input.replace(
    regEx(/(?:to|redirect\.|www\.)?github\.com/i),
    'redirect.github.com',
  );
}

function collectLinkPosition(input: string, matches: UrlMatch[]): Plugin {
  const transformer = (tree: RootContent): void => {
    const startOffset = coerceNumber(tree.position?.start.offset);
    const endOffset = coerceNumber(tree.position?.end.offset);

    if (tree.type === 'link') {
      const substr = input.slice(startOffset, endOffset);
      const url: string = tree.url;
      const offset: number = startOffset + substr.lastIndexOf(url);
      if (urlRegex.test(url)) {
        matches.push({
          start: offset,
          end: offset + url.length,
          replaceTo: massageLink(url),
        });
      }
    } else if (tree.type === 'text') {
      const globalUrlReg = new RegExp(urlRegex, 'gi');
      const urlMatches = [...tree.value.matchAll(globalUrlReg)];
      for (const match of urlMatches) {
        const [url] = match;
        const start = startOffset + coerceNumber(match.index);
        const end = start + url.length;
        const newUrl = massageLink(url);
        matches.push({ start, end, replaceTo: `[${url}](${newUrl})` });
      }
    } else if ('children' in tree) {
      tree.children.forEach((child: RootContent) => {
        transformer(child);
      });
    }
  };

  return () => transformer as Transformer;
}

export function massageMarkdownLinks(content: string): string {
  try {
    const rightSpaces = content.replace(content.trimEnd(), '');
    const matches: UrlMatch[] = [];
    remark().use(collectLinkPosition(content, matches)).processSync(content);
    const result = matches.reduceRight((acc, { start, end, replaceTo }) => {
      const leftPart = acc.slice(0, start);
      const rightPart = acc.slice(end);
      return leftPart + replaceTo + rightPart;
    }, content);
    return result.trimEnd() + rightSpaces;
  } catch (err) /* v8 ignore start */ {
    logger.warn({ err }, `Unable to massage markdown text`);
    return content;
  } /* v8 ignore stop */
}
