#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

host=${DEPLOY_HOST:-root@164.68.110.193}
ssh=(ssh -i "${DEPLOY_KEY:-$HOME/.ssh/id_chrysrakk}" -o IdentitiesOnly=yes -o BatchMode=yes "$host")

echo "Deploying $(git log -1 --format='%h %s')"
git archive HEAD | "${ssh[@]}" 'cd /root/six-frites && tar -x'
comm -23 <(git log --no-renames --diff-filter=D --name-only --pretty=format: | grep -v '^$' | grep -v '^\.env' | sort -u) \
  <(git ls-tree -r --name-only HEAD | sort -u) | "${ssh[@]}" "cd /root/six-frites && xargs -r -d '\n' rm -f --"
# The lock stops a manual deploy and a CI one from interrupting each other.
"${ssh[@]}" 'cd /root/six-frites && flock .deploy.lock sh scripts/server-deploy.sh'

for _ in $(seq 30); do
  curl -fs -o /dev/null https://six-frites.koera.mg/health && echo "Live" && exit 0
  sleep 5
done
echo "The API isn't answering /health after 150s" >&2
exit 1
