# Arena runtime

This is a separate Node 24+ authority. GitHub Pages serves the browser only. Do not enable the online entry in a production build until this runtime, the SQL migration and real two-account tests are complete.

Build `docker build -f Dockerfile.arena -t redentore-arena .`, start with a private environment file, mount a persistent writable volume at `/data`, expose port 8787 only through a TLS reverse proxy. Health: `GET /health`; upgrade: `/arena`. Proxy must forward WebSocket upgrades, allow long-lived connections, and preserve `Origin`. No public tunnel from a developer machine. One process/replica: room admission is in memory. Do not horizontally scale without shared admission. Unexpected restart ends active games; committed/outbox rewards remain recoverable. Stop by SIGTERM; allow at least 15 seconds graceful drain.

Required environment:

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`: same public project as hub.
- `REFEREE_DATABASE_URL`: TLS Postgres connection for **only** `coop_referee`, operator-created login. Never use service-role, postgres, or an account owner's credential. Use the project's session pooler for IPv4 if required; do not disable TLS verification. Database password must be URI encoded. Never put this in a VITE variable or browser bundle.
- `ARENA_ORIGINS`: exact comma-separated allowed browser origins, e.g. `https://monga-hub.github.io` (no trailing slash). No `*`.
- `ARENA_DATA_DIR`: durable private writable directory for SQLite award outbox, default container `/data`. Its contents include account UUIDs; back it up and restrict access. SQLite WAL and synchronous FULL are used before sending success.
- `HOST=0.0.0.0`, `PORT=8787` inside container. Set PORT to provider's port if needed.
- `ARENA_MAX_ROOMS=1` initially. Capacity on any candidate paid/free host is unmeasured; increase only after tick/memory/egress measurements.

Frontend build: `VITE_COOP_URL=wss://chosen-host/arena npm run build`. No browser config is committed for a hypothetical host. Default UI says server not configured. A loopback ws URL is allowed only on localhost for development.

Apply `supabase/coop-arena.sql` once through an authorized SQL session. It creates `coop_referee NOLOGIN`, two arena-only tables and two functions; saves RLS remains unchanged. Operator separately sets LOGIN/password and connection limits on the dedicated role, grants connect on the selected database if default CONNECT was revoked. Role needs no direct table privileges. Verify it can execute `coop_award`, cannot select `saves`, `auth.users`, or `coop_rewards`, cannot execute `coop_claim` (except default harmless public functions outside this migration). Test receipts only with explicitly permitted test identities. Do not create accounts implicitly. Browser existing Auth JWT only reads own save and claims own receipt.

Rollback: archive rewards/pending outbox first, disable frontend endpoint, stop runtime, apply `supabase/coop-arena-rollback.sql`. This removes arena-only objects/role, leaving campaign/account policies unchanged. Already claimed items remain in campaign saves.

Authority: runtime computes all movement, cooldowns, real learned ability effects, HP, stage and five-minute survival. Only living heroes at the end get one random canonical C3 legendary component. Dead heroes spectate until both die or the timer ends. No friendly fire, arena XP, gold, ordinary drops, campaign quest changes or inventory use. Potions are existing cooldown abilities. Permanent boon/gear retained; temporary blessing timers excluded. All learned spells can be equipped into the same primary + eight-slot limit as solo, chosen in the lobby; unequipped skills do not auto-cast. Network visuals currently show existing hero/enemy rigs, movement, hits/deaths and a cast ring; detailed spell VFX remain on the simulation side and are not all reproduced remotely.

Duplicate/out-of-order input seq is ignored; per-slot counters avoid repeated tap actions. Exactly two distinct accounts, server-generated 128-bit invites, per-tab random reconnect lease, one active socket/account. No public topic. Join only in lobby; same account+lease may reconnect within 8 seconds; disconnected simulation pauses. Hidden mobile page explicitly leaves. Timeout/stall ends without reward, no host migration/catch-up.

Durable rewards: server writes SQLite outbox synchronously before idempotent Postgres mint; failed delivery retries and restarts recover. Award function fixes the first winner list for a match. Claim row-locks receipt and owner save together, checks expected save stamp, refuses full bag without consuming reward. Response loss/replay returns receipt already in save, never doubles it. Save reward receipt metadata is preserved across CloudSync's gameplay winner/loser merge, and missing delivery is replayed once into the selected save (or deferred if full). Solo keep imports newly merged receipts into its live bag. Receipts remain in the ledger for repair after an old client overwrites metadata. This protects ordinary supported-client stale saves; historical owner-editable saves remain forgeable, and independent offline branching campaign inventories cannot offer competitive anti-cheat or conflict-free item spending.

External release gates: authorized host/secret+DB setup; two real accounts plus third client; real WSS combat, win/loss, claim/full-bag/reload/solo merge; landscape touch and desktop screenshots from both clients; memory/tick budget at one room. Local fixture proof is not internet-service proof.
