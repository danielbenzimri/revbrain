# @revbrain/bb3-normalizer

Implementation of BB-3, the Migration Planner IR Normalizer. Consumes
extraction findings produced by BB-2 and emits a deterministic `IRGraph`
consumed by later building blocks (BB-4/BB-5). This package is where the
Apex tree-sitter parsers, formula parser, SOQL field-ref extractor, cycle
detector, and the `normalize()` pipeline entry point all live.

Unlike its sibling `@revbrain/migration-ir-contract`, this package
**does** depend on `tree-sitter` and `tree-sitter-sfapex` (the npm
package name for Anthony Heber's sfapex grammar) to parse Apex class
bodies and triggers — so it is not safe to import from a Deno edge
function. Downstream consumers should depend on the contract package
for types and on this package only where parsing or normalization is
actually needed.

For convenience this package re-exports the full contract surface, so
call sites can `import { IRGraph, normalize } from '@revbrain/bb3-normalizer'`
without juggling two imports.
