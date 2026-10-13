# Styling ownership

Place component-specific styles in `ComponentName.module.css` beside the React component. Keep design tokens, resets, global application/Electron shell behavior, shared keyframes, and impractical third-party overrides in the global stylesheet. A parent controls a child's placement in its layout; the child owns its internal visual structure. Avoid adding new global component selectors.
