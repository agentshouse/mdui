import { htmlText } from 'micromark-core-commonmark';
const checkComment = function(effects, ok, nok) {
    const opening = [
        60,
        33,
        45,
        45
    ];
    let index = 0;
    let first = true;
    return (code)=>{
        effects.enter('htmlTextData');
        return prefix(code);
    };
    function accept(code) {
        effects.exit('htmlTextData');
        return ok(code);
    }
    function prefix(code) {
        if (code !== opening[index]) return accept(code);
        effects.consume(code);
        index += 1;
        return index === opening.length ? start : prefix;
    }
    function start(code) {
        return code === 62 ? nok(code) : inside(code);
    }
    function inside(code) {
        if (code === null) return nok(code);
        effects.consume(code);
        if (code === 45) return dash;
        first = false;
        return inside;
    }
    function dash(code) {
        if (code === 45) {
            effects.consume(code);
            return close;
        }
        if (first && code === 62) return nok(code);
        first = false;
        return inside(code);
    }
    function close(code) {
        return code === 62 ? accept(code) : nok(code);
    }
};
const historicalHtml = {
    name: 'gfm029HtmlText',
    tokenize (effects, ok, nok) {
        return effects.check({
            tokenize: checkComment,
            partial: true
        }, htmlText.tokenize.call(this, effects, ok, nok), nok);
    }
};
export const comments = {
    disable: {
        null: [
            'htmlText'
        ]
    },
    text: {
        60: historicalHtml
    }
};
