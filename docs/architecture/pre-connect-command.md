# Teleport (`tsh`) pre-connect tunnels for PostgreSQL

Status: implemented. Scope: PostgreSQL connections only.

DataKoala can open a Teleport database tunnel for a saved PostgreSQL profile and
keep it alive for the lifetime of the connection. This lets a profile reach a
database that is only reachable through Teleport, without the user running
`tsh proxy db` in a separate terminal. The settings live on an **Advanced** tab
of the PostgreSQL connection form.

## Behaviour verified against real Teleport

Probed with tsh `18.7.1` against a corporate Teleport cluster
(proxy `18.11.6`) on macOS. The service, user and cluster names below are
placeholders.

- `tsh status --format=json` exits 0 and returns `active.{profile_url,
username, cluster, roles}`. This is the login check; it never opens a browser.
- `tsh proxy db --tunnel -p <port> -u <db-user> -n <db-name> <db-service>`
  prints `Started authenticated tunnel … on 127.0.0.1:<port>` and binds a
  **plain TCP** listener.
- The loopback listener **does not speak TLS**: `sslmode=require` and
  `verify-full` fail with "The server does not support SSL connections".
- The client **must connect as the same user** given to `--db-user`
  (for example `db-user@example.iam`). Any other user (for example the
  OS default) is rejected with "access to db denied. User does not have
  permissions.".
- **No password is needed** in `--tunnel` mode.
- Without `--tunnel`, the proxy requires client certificates (`ca_file`,
  `cert_file`, `key_file` printed at startup) and rejects plain connections. That
  mode is not usable by a plain `pg` client, so DataKoala always passes
  `--tunnel`.
- `tsh db ls` can open a browser for an access request, so it is never invoked
  automatically. Only `tsh status` runs implicitly.

## Decisions

| Topic       | Decision                                                            |
| ----------- | ------------------------------------------------------------------- |
| Scope       | PostgreSQL only                                                     |
| Config      | Structured Teleport settings, not a free-form shell string          |
| Execution   | `spawn(binary, argv)` with no shell; values are discrete argv items |
| Mode        | Always `tsh proxy db --tunnel`                                      |
| Readiness   | Poll `127.0.0.1:<tunnelPort>` until it accepts, or time out         |
| Auth        | Check `tsh status` first; never run `tsh login` for the user        |
| Keepalive   | Restart with backoff on exit; periodic TCP health-check             |
| Pool target | Derived `127.0.0.1:<tunnelPort>`; TLS disabled; no password         |
| Secrets     | None stored; Teleport auth is out-of-band via `tsh login`           |
| Binary      | `tsh` from PATH, with an optional absolute-path override            |

## Data model

`PostgresProfile.preConnect?: TeleportPreConnect` in `src/shared/types.ts`
(no profile version bump — the field is optional and ignored by older profiles).

```ts
interface TeleportPreConnect {
  mode: 'teleport'
  dbService: string
  dbUser?: string // defaults to the profile user
  dbName?: string // defaults to the profile database
  cluster?: string
  proxy?: string
  login?: string
  tunnelPort: number
  tshPath?: string
  keepalive?: boolean // default true
  timeoutMs?: number // default 20000
}
```

There is one set of credentials, not two. The tunnel's `--db-user`/`--db-name`
are the profile's `user`/`database`: the Postgres client must connect as the same
user the tunnel started with, and the tunnel is pinned to that database. The type
keeps `dbUser`/`dbName` optional (they fall back to the profile values), but the
form does not expose them separately. The profile's `host`, `port`, `tlsMode` and
`password` are replaced at connect time by the tunnel values and are not used
directly while Teleport is on, so those fields are disabled and not required while
the tunnel is enabled. `user` and `database` are shared, so they stay required.

## Modules

- `src/shared/teleport.ts` — pure and shared with the renderer:
  `buildProxyDbArgs`, `formatProxyDbCommand`, `parseTshStatus`,
  `resolveTshBinary`, `tunnelTimeout`, `isValidTunnelPort`, `DEFAULT_TUNNEL_HOST`.
  (`DEFAULT_TUNNEL_PORT` lives in the renderer draft module.)
- `src/main/preconnect/port-probe.ts` — `probePort` and `waitForPort` over
  `node:net`; injectable for tests.
- `src/main/preconnect/errors.ts` — `PreConnectError` with codes
  (`TSH_NOT_FOUND`, `TSH_NOT_LOGGED_IN`, `TUNNEL_TIMEOUT`, `TUNNEL_FAILED`,
  `INVALID_CONFIG`) and output sanitisation.
- `src/main/preconnect/teleport-manager.ts` — `TeleportTunnelManager`: one
  supervised process per profile, generation-guarded.
- `src/main/preconnect/effective-profile.ts` — `resolveTeleportConfig` and
  `applyTeleportTunnel` (pure translation).
- `src/main/adapters/postgres-adapter.ts` — starts/stops the tunnel around
  `test`/`connect` and on `cancelConnect`/`shutdown`.

## Lifecycle

```
checking-tsh → checking-login → starting → waiting-for-port → ready
                                                    ↘ restarting → waiting-for-port …
stopped / failed
```

- **checking-login**: `tsh status --format=json`; no `active` section →
  `TSH_NOT_LOGGED_IN` ("Run tsh login, then try again").
- **starting / waiting-for-port**: spawn detached (own process group) and poll
  the port. An early process exit fails the start with the sanitised stderr.
- **ready**: if keepalive is on, a TCP health-check runs on an interval; two
  consecutive failures, or an unexpected process exit, schedule a restart with
  exponential backoff (also re-checking `tsh status`, so an expired certificate
  surfaces as "run tsh login" rather than a cryptic pg error).
- **stop**: SIGTERM the process group, then SIGKILL after a grace period.

Generation/intent guards (mirroring `postgres.ts`) ensure a superseded connect
cannot kill or leak a newer tunnel that shares the profile id, and `stop` with a
generation is a no-op for a newer tunnel.

## Wiring

- `PostgresAdapter.test`: start tunnel → `testConnection(effective)` → always
  `stop` in `finally` (ephemeral).
- `PostgresAdapter.connect`: start tunnel → `connectPostgres(effective)`; on
  failure stop the tunnel; the session `close` stops the tunnel with its
  generation.
- `PostgresAdapter.cancelConnect` / `shutdown`: also stop the tunnel(s). The app
  quit path (`gracefulShutdown` → `db.disconnectAll`) already reaches the
  adapter, so tunnels are cleaned up on exit.

No new IPC channel is needed: the existing `connection:test` and
`connection:connect` calls carry `preConnect`, so the "Test" button exercises the
real tunnel path.

## UI

`PostgresConnectionModal` has **Connection** and **Advanced** tabs (Advanced is
always present, as the home for advanced connection features; Teleport is the
first). The Connection tab is the normal PostgreSQL form. The Advanced tab holds a
compact **Teleport tunnel** box: a single toggle and, when enabled, database
service, tunnel port and an optional `tsh` path, plus a `tsh proxy db …` command
preview and a note. Enabling the tunnel soft-disables the fields it overrides on
the Connection tab (paste string, host, port, TLS, CA, password) and shows a short
note there; the disabled Host and Port display the effective tunnel values
(`localhost` and the tunnel port) and update live, while the draft keeps the
original values. User and Database stay editable because they are the Teleport
database user/name. Validation switches to whichever tab holds the first error
before focusing it.

The database service stays required and is a searchable combobox: opening it
discovers services from `tsh` in the background (`tsh db ls --format=json`,
filtered to PostgreSQL), and typing filters the list, with a free-text value
accepted for anything not discovered. Discovery never assumes `tsh` exists: a
missing binary, an expired session and other failures are shown inline, and the
field can still be typed by hand.

## Security notes

- The command is never built as a shell string and never run through a shell.
- No credentials are stored; the config is plain metadata in `connections.json`.
- Process output shown in errors is redacted (`sanitizeTshOutput`).
- Teleport tunnels always terminate on loopback.

## Testing

- `src/shared/teleport.test.ts` — argv construction, status parsing, defaults.
- `src/main/preconnect/port-probe.test.ts` — real `net.Server` readiness.
- `src/main/preconnect/teleport-manager.test.ts` — a fake child covers ready,
  failures, keepalive restart, health-check restart, supersede and teardown.
- `src/main/preconnect/effective-profile.test.ts` — profile translation.
- `src/renderer/src/lib/connectionDraft.test.ts` and
  `ConnectionModal.test.tsx` — draft round-trip and the Advanced tab.
- Real-path check performed manually: `PostgresAdapter.connect` against a
  live Teleport database service returned server `18.3`, ran
  `select current_user, current_database()`, and cleaned up the `tsh` process.

## Known limitations

- macOS GUI apps often do not inherit the shell `PATH`; set the `tsh` path
  explicitly if `tsh` is not found.
- Only Teleport `--tunnel` mode is supported (the certificate mode needs client
  certificates that DataKoala does not manage).
- A tunnel restart relies on the existing pool idle-recovery path; the pool is
  not force-reconnected. The database user must match the Teleport `--db-user`.
