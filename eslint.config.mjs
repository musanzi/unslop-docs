import eslint from '@eslint/js';
import angular from 'angular-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import unusedImports from 'eslint-plugin-unused-imports';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['.angular/', '.nx/', 'dist/', 'out-tsc/', 'coverage/', 'libs/api-contracts/src/lib/']),

  {
    files: ['**/*.{js,mjs,cjs,ts,mts}'],
    extends: [eslint.configs.recommended],
    languageOptions: {
      globals: globals.node
    }
  },

  {
    files: ['**/*.{ts,mts}'],
    extends: [tseslint.configs.recommended]
  },

  {
    files: ['apps/web/**/*.ts'],
    extends: [
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      jsdoc.configs['flat/contents-typescript'],
      jsdoc.configs['flat/logical-typescript'],
      jsdoc.configs['flat/stylistic-typescript']
    ],
    plugins: {
      'unused-imports': unusedImports
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_'
        }
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: ['element', 'attribute'],
          prefix: '',
          style: 'kebab-case'
        }
      ],
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: '',
          style: 'camelCase'
        }
      ],
      '@angular-eslint/component-class-suffix': 'off',
      '@angular-eslint/directive-class-suffix': 'off',
      '@angular-eslint/no-input-rename': 'off'
    }
  },

  {
    files: ['apps/web/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility]
  },

  {
    files: ['apps/api/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },

  {
    files: ['apps/web/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off'
    }
  }
);
