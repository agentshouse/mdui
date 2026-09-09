import { gfm, gfmHtml } from 'micromark-extension-gfm';

export const markdownProfile = {
  extensions: [
    gfm({ singleTilde: false }),
    { disable: { null: ['gfmFootnoteDefinition', 'gfmFootnoteCall', 'gfmPotentialFootnoteCall'] } },
  ],
  htmlExtensions: [gfmHtml()],
};
