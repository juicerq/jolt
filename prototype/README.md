# Bun Engine technical prototype

Throwaway code that tests whether Electron can supervise a Bun process while React calls an oRPC contract backed by Drizzle and `bun:sqlite`.

```bash
bun install
bun run dev
```

The engine creates `PROTOTYPE-WIPE-ME.sqlite` in Electron's temporary prototype directory. The database is disposable.

Run the Electron host against the compiled Bun executable:

```bash
bun run build:engine
bun run dev:compiled
```

The screen opens an oRPC Event Iterator and exposes two manual read-only probes. The Codex probe initializes `app-server`, reads the account and lists models. The Claude probe reads CLI auth status and only starts an SDK query when the CLI reports no login.
