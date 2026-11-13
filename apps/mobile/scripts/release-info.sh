# Sourced by the release scripts: sets $version from app.config.ts and $notes to its English changelog notes.
version=$(sed -n 's/^  version: "\(.*\)",$/\1/p' app.config.ts)
notes=$(npx tsx -e '
import("../../packages/shared/src/changelog.ts").then(({ CHANGELOG }) => {
  const release = CHANGELOG.find((r) => r.version === process.argv[1]);
  if (!release) process.exit(1);
  console.log(release.notes.en.map((note) => `• ${note}`).join("\n"));
});' "$version") || {
  echo "Add $version to packages/shared/src/changelog.ts before building it." >&2
  exit 1
}
