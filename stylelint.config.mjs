export default {
  ignoreFiles: ['docs-site/dist/**'],
  extends: ['stylelint-config-standard'],
  rules: {
    // CSS Modules are consumed through camelCase JS property access (e.g. styles.queryTabs).
    // Enforcing kebab-case here would create noisy cross-file renames without improving correctness.
    'selector-class-pattern': null,
    // Component styles frequently contain structurally unrelated selectors that
    // Stylelint cannot distinguish without DOM knowledge, producing systematic
    // false positives across CSS Modules.
    'no-descending-specificity': null,
    'selector-pseudo-class-no-unknown': [
      true,
      {
        ignorePseudoClasses: ['global', 'local'],
      },
    ],
  },
}
