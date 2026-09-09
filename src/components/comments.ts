import { htmlText } from 'micromark-core-commonmark';
import type { Code, Construct, Extension, State, Tokenizer } from 'micromark-util-types';

const checkComment: Tokenizer = function (effects, ok, nok) {
  const opening = [60, 33, 45, 45];
  let index = 0;
  let first = true;
  return (code) => {
    effects.enter('htmlTextData');
    return prefix(code);
  };

  function accept(code: Code): State | undefined {
    effects.exit('htmlTextData');
    return ok(code);
  }

  function prefix(code: Code): State | undefined {
    if (code !== opening[index]) return accept(code);
    effects.consume(code);
    index += 1;
    return index === opening.length ? start : prefix;
  }

  function start(code: Code): State | undefined {
    return code === 62 ? nok(code) : inside(code);
  }

  function inside(code: Code): State | undefined {
    if (code === null) return nok(code);
    effects.consume(code);
    if (code === 45) return dash;
    first = false;
    return inside;
  }

  function dash(code: Code): State | undefined {
    if (code === 45) {
      effects.consume(code);
      return close;
    }
    if (first && code === 62) return nok(code);
    first = false;
    return inside(code);
  }

  function close(code: Code): State | undefined {
    return code === 62 ? accept(code) : nok(code);
  }
};

const historicalHtml: Construct = {
  name: 'gfm029HtmlText',
  tokenize(effects, ok, nok) {
    return effects.check(
      { tokenize: checkComment, partial: true },
      htmlText.tokenize.call(this, effects, ok, nok),
      nok,
    );
  },
};

export const comments: Extension = {
  disable: { null: ['htmlText'] },
  text: { 60: historicalHtml },
};
