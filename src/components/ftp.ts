import {
  asciiAlphanumeric,
  markdownLineEndingOrSpace,
  unicodeWhitespace,
} from 'micromark-util-character';
import { sanitizeUri } from 'micromark-util-sanitize-uri';
import type { Code, Extension, HtmlExtension, State, Tokenizer } from 'micromark-util-types';

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    literalAutolinkFtp: 'literalAutolinkFtp';
  }
}

function boundary(code: Code): boolean {
  return code === null || markdownLineEndingOrSpace(code) || unicodeWhitespace(code);
}

function previous(code: Code): boolean {
  return boundary(code) || code === 42 || code === 95 || code === 126 || code === 40;
}

function alphanumeric(code: number): boolean {
  return (
    asciiAlphanumeric(code) || (code > 127 && /[\p{L}\p{N}]/u.test(String.fromCodePoint(code)))
  );
}

function linkEnd(value: number[]): number {
  let end = value.length;
  let parentheses = 0;
  for (const code of value) {
    if (code === 40) parentheses += 1;
    if (code === 41) parentheses -= 1;
  }
  while (end > 6) {
    const last = value[end - 1];
    if ([63, 33, 46, 44, 58, 42, 95, 126].includes(last)) end -= 1;
    else if (last === 41 && parentheses < 0) {
      end -= 1;
      parentheses += 1;
    } else if (last === 59) {
      let start = end - 2;
      while (start >= 6 && asciiAlphanumeric(value[start])) start -= 1;
      if (start === end - 2 || value[start] !== 38) break;
      end = start;
    } else break;
  }
  return end;
}

function validDomain(value: number[], end: number): boolean {
  const segments: number[][] = [[]];
  for (let index = 6; index < end; index += 1) {
    const code = value[index];
    if (code === 46) segments.push([]);
    else if (alphanumeric(code) || code === 45 || code === 95) segments.at(-1)!.push(code);
    else break;
  }
  return (
    segments.length > 1 &&
    segments.every((segment) => segment.length > 0) &&
    segments.slice(-2).every((segment) => !segment.includes(95))
  );
}

const tokenizeFtp: Tokenizer = function (effects, ok, nok) {
  const prefix = [102, 116, 112, 58, 47, 47];
  const value: number[] = [];
  let length = 0;
  let consumed = 0;
  const context = this;

  function start(code: Code): State | undefined {
    if (
      !previous(context.previous) ||
      context.events.some(
        ([, token]) =>
          (token.type === 'labelLink' || token.type === 'labelImage') && !token._balanced,
      )
    )
      return nok(code);
    return effects.check({ tokenize: candidate, partial: true }, accepted, nok)(code);
  }

  const candidate: Tokenizer = function (effects, ok, nok) {
    return (code) => {
      effects.enter('literalAutolinkFtp');
      return scan(code);
    };

    function scan(code: Code): State | undefined {
      if (value.length < prefix.length) {
        const lower = code !== null && code >= 65 && code <= 90 ? code + 32 : code;
        if (lower !== prefix[value.length]) return nok(code);
      } else if (code === 60 || boundary(code)) {
        length = linkEnd(value);
        if (!validDomain(value, length)) return nok(code);
        effects.exit('literalAutolinkFtp');
        return ok(code);
      }
      if (code === null || code < 0) return nok(code);
      value.push(code);
      effects.consume(code);
      return scan;
    }
  };

  return start;

  function accepted(code: Code): State | undefined {
    effects.enter('literalAutolinkFtp');
    return consume(code);
  }

  function consume(code: Code): State | undefined {
    if (consumed === length) {
      effects.exit('literalAutolinkFtp');
      return ok(code);
    }
    effects.consume(code);
    consumed += 1;
    return consume;
  }
};

const ftp = { name: 'gfm029Ftp', tokenize: tokenizeFtp, previous };

export const ftpSyntax: Extension = { text: { 70: ftp, 102: ftp } };

export const ftpHtml: HtmlExtension = {
  exit: {
    literalAutolinkFtp(token) {
      const value = this.sliceSerialize(token);
      this.tag('<a href="' + sanitizeUri(value) + '">');
      this.raw(this.encode(value));
      this.tag('</a>');
    },
  },
};
