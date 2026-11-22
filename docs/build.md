# YSG reader and review editor

This repository serves the 2026-11-21 manuscript through the independent YSG reader API.
The root application contains the page-image reader. `review-source/` contains the body,
footnote, memo and revision editor served at `/review/`.

Use Node.js 22.13 or later. Install dependencies with `npm ci` in the repository root and
in `review-source/`, then run `node scripts/build-release.mjs` from the root. The result is `dist/`.
The checked-in `public/editions/20261023/` and `public/editions/20261024/` are preserved releases.

The public review config retains the existing visitor identity and reference asset namespace.
Only a Supabase publishable key is stored in that config. Current manuscript paragraphs,
page metadata, images, reference manifests and text are fetched through the protected
`ysg-visit` / `ysg-page` endpoints; sticky notes use `ysg-notes`.
No current manuscript PDF or HWPX is part of this repository or its static build.

Saved paragraph and footnote changes appear in the editor's revision list. JSON and UTF-8
BOM CSV history exports prepare an explicit download link. Each CSV Before cell contains
the preceding revision, and each After cell contains that revision's saved text.

The protected Storage catalog for edition `ysg-20261121` is managed separately. Do not
reconstruct it from old public releases or copy a private manuscript catalog into frontend code.
Database migrations and the three Edge Function sources are included under `supabase/`.
Deploy those only through the project-specific release workflow, with server credentials
provided by the runtime environment.

Publishing uses separate source (`main`) and static (`gh-pages`) commits in the existing
dedicated repository. Each release must compare the exact remote head, retain it as the
new commit's parent, and use a normal push. Never force-push or replace repository history.
