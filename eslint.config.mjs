import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

// Rules that require restructuring rather than a local fix are kept as warnings so the
// lint gate stays enforceable while the backlog stays visible. See docs/ROADMAP.md.
const backlog = {
  '@typescript-eslint/no-explicit-any': 'warn',
  // Omitting a field via rest destructuring is intentional, and a leading
  // underscore is the project's marker for a deliberately unused binding.
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      args: 'after-used',
      ignoreRestSiblings: true,
      varsIgnorePattern: '^_',
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
}
const reactBacklog = {
  'react-hooks/set-state-in-effect': 'warn',
  'react-hooks/purity': 'warn',
  'react-hooks/immutability': 'warn',
  'react-hooks/refs': 'warn',
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      'apps/agent/**',
      'apps/api/prisma/migrations/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: backlog },

  // Backend: NestJS services and controllers run on Node.
  {
    files: ['apps/api/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // Frontend: React 19 with the hooks lint rules.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { ...reactHooks.configs.recommended.rules, ...reactBacklog },
  },

  // Tests use hand-built Prisma doubles; the shapes are deliberately partial.
  {
    files: ['apps/*/test/**/*.ts', 'apps/*/test-integration/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  prettier,
)
