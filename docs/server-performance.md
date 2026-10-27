# Server performance

Notes from 27 Oct 2026.

## Verdict

Don't upgrade the server yet. The app feels slow because each network round trip from Antananarivo (Starlink) to the server in France takes about 475 ms. The server itself answered in about 0 ms.

More CPU or RAM can't shorten those trips. Fewer round trips, or a shorter path, will.

## What was measured

Measured from the Mac in Antananarivo, on Starlink.

| Check | Result |
| --- | --- |
| Ping to server (Contabo, Lauterbourg FR, 164.68.110.193) | ~475 ms |
| Ping to Cloudflare (1.1.1.1), same connection | ~130 ms |
| `/health` total | 1.23 s |
| TCP connect | 0.40 s (1 round trip) |
| TLS handshake | +0.43 s (1 round trip) |
| Request to first byte | +0.40 s (1 round trip, server work ≈ 0 ms) |
| HTTP version | HTTP/2, no HTTP/3 |
| CDN in front | None |
| Static JS files | Cached for 1 year (immutable), fine |

The traceroute leaves Starlink in Africa and climbs to France through several carriers. Most of the delay builds up on that path, not in the server.

## To do, best first

- [ ] **Put Cloudflare (free plan) in front of the domain.** The encrypted connection is then set up with a Cloudflare server ~130 ms away instead of 475 ms, and static files are cached close to users. WebSockets work through it.
  - TURN (port 3478 UDP) can't go through Cloudflare's proxy. Give it its own DNS-only hostname (grey cloud) and use that hostname in `TURN_URLS` in `docker-compose.prod.yml`.
  - Free plan caps uploads at 100 MB per request. Check that's above the app's media limit.
- [ ] **Turn on HTTP/3 in Traefik.** HTTP/3 sets up a connection in one round trip instead of two, saving ~450 ms on each new connection. Add `http3: {}` to the `websecure` entry point and open UDP 443 in the firewall. (Not needed if Cloudflare is in front: it does HTTP/3 itself.)
- [ ] **Make fewer back-to-back requests in the app.** Every encrypted message sends `GET /v1/devices` and only then the `POST`, so two round trips (~1 s) per message. The server already rejects a stale device list with `DEVICES_CHANGED` and pushes `devices.changed` events, so the client can keep the device list in memory and refresh it only on those. Saves ~450 ms per message sent. Code: `encryptForAll` / `devicesOf` in `packages/sdk/src/e2ee.ts`.
- [ ] **Consider a server closer to users.** Only if most users are in Madagascar too. Ask one or two of them on Telma or Orange to `ping six-frites.koera.mg` first and compare with the 475 ms above.

## When to upgrade

Run this read-only check on the server (load, memory, disk, per-container usage, database stats):

```sh
ssh root@164.68.110.193 '
uptime; nproc
free -h
df -h / | tail -1
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
vmstat 1 5
docker exec $(docker ps -qf name=six-frites-postgres) psql -U six -d six -Atc \
  "select pg_size_pretty(pg_database_size(current_database())), (select count(*) from pg_stat_activity), (select round(100.0*sum(blks_hit)/nullif(sum(blks_hit+blks_read),0),1) from pg_stat_database)"
'
```

An upgrade is worth it only if the output shows one of these:

- load average above the CPU count (`nproc`)
- high `st` (CPU taken by other VMs on the host) or high `wa` (waiting on disk) in vmstat
- swap in use
- a Postgres cache hit rate under ~99% (the last number of the psql line)

## Minor

The API and the worker run their TypeScript through `npx tsx`, which compiles it at runtime. That uses extra RAM and slows restarts, but doesn't slow down requests. Only worth fixing if the check above shows memory is tight: compile to JS in the Docker build and run it with `node`.
