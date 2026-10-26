# Single-line and aligned Loki rows — #523 / #529

Base: `673650015b828d6c0b44a163f1672f348010eb66`.

The shared row intentionally allowed wrapping and severity badges occupied only their text width. Loki now opts into a single-line preview variant. CSS collapses preview line breaks to spaces and ellipsizes overflow without changing the source text, details or copy payload. Pattern placeholders/highlights remain inline. Tempo keeps its existing row policy.

Both Loki lists reserve the same 88px severity slot, including missing levels. Long/custom badges ellipsize within that slot. Time/count columns remain independent; controls retain their space. Virtualization still measures actual rows and preserves focused identity.

Retest canonical W01–W06, L09/L10 and RC-11: mixed/missing/custom levels in Logs/Patterns, explicit newlines and long highlighted templates, normal/narrow widths, scroll a large list, pointer/Enter/Space, inspector/copy and Patterns → View logs. Compare rendered level-cell widths and message starts within each view; check Tempo for unchanged wrapping. Rendered geometry/native screenshots and human acceptance remain Pending (local Electron sockets blocked). DOM class assertions are not pixel evidence.
