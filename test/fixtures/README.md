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

The pure dependency conformance seam follows the source fixture's extension
annotations: base examples use the core parser with the historical comment
integration, and extension examples use the
renderer profile. This avoids applying the autolink and tagfilter extensions
to examples that intentionally demonstrate base syntax without them. Checkbox
attribute order and void-element slash spelling are normalized on both sides;
text, element nesting, and destinations are compared exactly.

`allowDangerousHtml` is enabled only in these string comparisons. Browser
rendering keeps raw HTML behind filtering hooks and preserves URI destinations
only in an inert intermediate tree before applying the
[component's safety policy](../../ARCHITECTURE.md#markdown-renderer).
The browser specifications own acceptance of that
policy, resource inertness, and interaction. Dependency qualification alone
is not component or security evidence. Failing examples remain failures; they
are not a permission to widen the profile or replace their expected results.
