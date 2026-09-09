# GFM conformance fixtures

`gfm-0.29.json` contains all 673 examples from the original upstream
[GFM 0.29 specification](https://github.com/github/cmark-gfm/blob/b8eb2e00de094999f978e9cb02b1a78d810812d3/test/spec.txt),
tag `0.29.0.gfm.0`, dated 2019-04-06. Later cmark tags and the mutable published
HTML page change examples without changing the displayed specification version.
The specification is based on CommonMark by John MacFarlane and is licensed
under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); these
extracted examples retain that license. Extraction preserves example numbers,
sections, Markdown and HTML line endings, and converts the specification's
visible tab arrows to tabs.

The [test policy](../../docs/agents/TESTING.md#location-and-naming) owns the
conformance modes, comparison rules, and browser acceptance. The renderer's
built safety boundary is documented in
[ARCHITECTURE.md](../../ARCHITECTURE.md#markdown-renderer).
