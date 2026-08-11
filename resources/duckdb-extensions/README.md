# Packaged DuckDB extensions

`pnpm prepare:sqlite-extension` asks the pinned DuckDB runtime to acquire its
signed official `sqlite_scanner` extension, verifies that the exact file can be
loaded, records its SHA-256, and places it in `<platform>-<arch>/`. The
application loads only this explicit path and never installs or downloads an
extension at runtime.

The ordinary `pnpm dev`, `pnpm start`, `pnpm preview`, `pnpm build`, and
`pnpm package` commands run this preparation/validation automatically before
Electron or the production bundler starts.

For local development, `DATAKOALA_SQLITE_EXTENSION_PATH` can point at a compatible
official binary. `pnpm package` runs acquisition and then explicitly fails when
the required platform file is absent; this repository never substitutes a
community or unsigned build.
