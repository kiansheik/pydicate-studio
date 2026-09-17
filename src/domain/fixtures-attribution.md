# Example evidence

`example-passages.json` contains eight source expressions and saved reference surfaces (Araújo 0063–0070) from [Kian Sheik's oldtupicorpus](https://github.com/kiansheik/oldtupicorpus), revision `292a28722a1790abf3f3b93083c29fbd47b4ffd0`. Source paths are recorded in the fixture. They were extracted from the source AST and paired with saved records by ordinal, without executing or changing corpus sources.

Saved record surfaces are example baselines, not new editorial decisions. The fixture does not invent transcriptions, normalized targets, translations, or PDF page mappings. Printed page metadata is taken from the saved records. IDs prefixed `example:` belong only to this bundled example; they are not a durable-ID migration of the corpus.

`render-snapshots.json` records outputs actually evaluated by the Python adapter. Its repository versions and engine fingerprint describe that evaluation. Browser example mode retrieves these outputs and labels their origin as `snapshot`; it never implements the language's realization rules in TypeScript. Use the local-project mode for current Python evaluation.

The corpus excerpts are distributed under the upstream MIT license:

Copyright (c) 2025 Kian Sheik

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
