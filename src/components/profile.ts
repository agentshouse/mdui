import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { comments } from './comments.js';
import { ftpHtml, ftpSyntax } from './ftp.js';

export const commonmarkProfile = { extensions: [comments] };

export const markdownProfile = {
  extensions: [
    comments,
    gfm({ singleTilde: false }),
    ftpSyntax,
    { disable: { null: ['gfmFootnoteDefinition', 'gfmFootnoteCall', 'gfmPotentialFootnoteCall'] } },
  ],
  htmlExtensions: [gfmHtml(), ftpHtml],
};
