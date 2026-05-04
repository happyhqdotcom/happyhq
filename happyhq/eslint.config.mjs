import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'prefer-const': 'off',
      '@next/next/no-img-element': 'off',
      // React Compiler safety rules pulled in by eslint-plugin-react-hooks@7
      // (via eslint-config-next 16). Disabled to land the toolchain upgrade
      // non-blocking; addressing the findings is its own piece of work.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      // The findings have been resolved (see git history), but the rule
      // misclassifies DOM-property writes on `useState<HTMLElement>` values
      // as state mutations. Re-enabling would force false-positive workarounds
      // across a recurring codebase pattern. Audit `useState<HTMLElement>`
      // sites before flipping this on.
      'react-hooks/immutability': 'off',
      'react/use': 'off',
    },
  },
]

export default eslintConfig
