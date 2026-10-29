# Deploying

Production runs on the shared server (`six-frites.koera.mg -> 164.68.110.193`) next to the other projects.
The server's Traefik terminates HTTPS and routes the domain: `/v1`, `/socket.io` and `/docs` to the API,
`/six-media` to SeaweedFS and everything else to the web app. The compose file runs the API, the media worker,
the web app, Postgres, Redis, SeaweedFS and coturn (TURN for calls, on the host network).

## Layout on the server

- `/root/six-frites`: the code and `.env` (secrets, chmod 600).
- `/root/traefik/config/dynamic/six-frites.yml`: the Traefik routes, a copy of `infra/traefik/six-frites.yml`.
  Traefik watches that folder, so no restart is needed.
- The API, web and storage containers join the `traefik_proxy` network as `six-frites-api`, `six-frites-web`
  and `six-frites-storage`.
- coturn listens on 3478 (UDP and TCP) and relays on UDP 49160-49200.

## First setup

```sh
cd /root/six-frites
cp .env.production.example .env
```

Fill in the secrets in `.env`. Each of `POSTGRES_PASSWORD`, `JWT_SECRET`, `BACKUP_PIN_SECRET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and
`TURN_SECRET` can be `openssl rand -hex 32`. Web push keys come from `npx web-push generate-vapid-keys`.
Never change `BACKUP_PIN_SECRET` once set: message backups protected by a PIN can't be opened without it.
`FCM_SERVICE_ACCOUNT` is the Firebase service account key for Android push (Firebase console, Project settings >
Service accounts > Generate new private key), the whole JSON on one line in single quotes.

In Google Cloud, add `https://six-frites.koera.mg` to the web client's Authorized JavaScript origins.

## Deploy and update

Every push to `main` deploys on its own (`.github/workflows/deploy.yml`). To deploy the current commit by hand:

```sh
npm run deploy
```

`scripts/deploy.sh` copies the committed code to the server and deletes the files the repo no longer has, since
leftovers break the web build's type check. It then rebuilds and restarts the containers, and waits for `/health`.
Uncommitted changes aren't deployed. It uses `~/.ssh/id_chrysrakk`; set `DEPLOY_KEY` to use another key.

The workflow needs two repository secrets, set once:

```sh
ssh-keygen -t ed25519 -N '' -C six-frites-deploy -f ~/.ssh/six-frites-deploy
ssh -i ~/.ssh/id_chrysrakk -o IdentitiesOnly=yes root@164.68.110.193 'cat >> ~/.ssh/authorized_keys' < ~/.ssh/six-frites-deploy.pub
gh secret set DEPLOY_SSH_KEY < ~/.ssh/six-frites-deploy
ssh-keyscan 164.68.110.193 | gh secret set DEPLOY_KNOWN_HOSTS
```

To revoke it, remove the `six-frites-deploy` line from the server's `~/.ssh/authorized_keys`.

Migrations run when the API starts. Logs: `docker compose -f docker-compose.prod.yml logs -f api worker web`.

## Backups

Postgres and media live in the `pgdata` and `seaweeddata` volumes. A database dump:

```sh
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U six six | gzip > /root/backups/six-$(date +%F).sql.gz
```

Message content is end to end encrypted, so the database only holds ciphertext and users need their recovery
key to read history on a new device.

## Mobile app

Build the release APK against production with `npm run build:android`. It points the app at
`https://six-frites.koera.mg`, regenerates `apps/mobile/android` and prints the APK's path, version and sha256.
Bump `version` and `android.versionCode` in `apps/mobile/app.config.ts` first.

For push notifications on Android, register the `com.sixfrites.app` Android app in the same Firebase project as
`FCM_SERVICE_ACCOUNT` and put its `google-services.json` in `apps/mobile/`. Builds without that file still work,
just without push.

New versions of the Android app are published on Koera Store (`https://store.koera.mg/admin`, app slug
`six-frites`). The API reads the newest one from there for the in-app update banner and the download link. To push
"new version" notifications, set the app's webhook in the store to `https://six-frites.koera.mg/v1/app/android/published`
and copy its webhook secret into `STORE_WEBHOOK_SECRET` in `.env`.
