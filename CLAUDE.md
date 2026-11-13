# Release notes

A commit that changes what members see or can do carries its note in `RELEASE_NOTES.md`, in that same commit. Each deploy posts the sections members haven't had yet in their Six Frites News chat, as one message in their language, so that file is what they read.

- Add a section at the very top, under the intro: `## ` and the time of the commit as `date "+%Y-%m-%d %Hh%M"` prints it, then `### en`, `### fr` and `### mg` (Malagasy), each with the same notes as `- ` lines, one line per note.
- Write for members: what they can do now, or what works now, in plain words and a sentence or two. No file, component or ticket names.
- No section for what members can't notice: refactors, tests, CI, docs, admin pages.
- A section already on `origin/main` has been sent, so never edit it. One that isn't can still be reworded, and a fix to something not deployed yet goes into that section rather than a new one.
- `npm test -w @six/shared` checks the file's format.
