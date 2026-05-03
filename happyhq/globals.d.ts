// TypeScript 6.0 enabled `noUncheckedSideEffectImports` by default, which
// flags `import './foo.css'` without ambient declarations. Next.js declares
// `*.module.css`/`*.module.sass`/`*.module.scss` in its bundled types but not
// plain `*.css` — declare it here so the side-effect import in `app/layout.tsx`
// type-checks.
declare module '*.css'
