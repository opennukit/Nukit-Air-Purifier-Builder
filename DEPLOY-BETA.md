# Deploy to beta.filterboxbuilder.com (without touching `main`)

Beta is served by the **Deploy** GitHub Action, which builds the site and pushes
it to the beta S3 bucket + CloudFront. It runs on a push to `main` **or** on a
manual `workflow_dispatch` against any branch. To update beta from a feature
branch **without modifying `main`**, dispatch the workflow on that branch.

## One-time prerequisites
- `git`, `gh` (GitHub CLI, authenticated), and `bun` installed locally.
- Repo: `opennukit/Nukit-Air-Purifier-Builder`.
- Repository variable `DEPLOY_ENABLED=true` is already set (the job skips otherwise).

## Deploy steps (run on your machine)

```sh
cd ~/Nukit-Air-Purifier-Builder
git checkout port-tempest-features          # the branch you want on beta
git pull                                     # make sure it's up to date
git push origin port-tempest-features        # pushes the branch only — NOT main
gh workflow run deploy.yml --ref port-tempest-features
gh run watch                                 # follow the build/deploy (optional)
```

`gh workflow run … --ref <branch>` checks out **that branch**, runs
`bun install` → `bun run build` → `bun test`, syncs `dist/` to S3, and
invalidates CloudFront. Beta refreshes in ~1–2 minutes.

To deploy a different branch, swap `port-tempest-features` for its name in both
the `git push` and the `gh workflow run` lines.

### Or from the GitHub UI
Repo → **Actions** → **Deploy** → **Run workflow** → pick the branch → **Run
workflow**.

## Verify
- Watch the run: `gh run watch` (or the **Actions** tab).
- Open https://beta.filterboxbuilder.com (hard-refresh; CloudFront is invalidated
  by the workflow).

## What this touches (and what it doesn't)
- **Deploys to beta only** — S3 bucket `filterboxbuilder-nukit`, CloudFront
  distribution `E3UC5U53489JKG` (alias `beta.filterboxbuilder.com`).
- **`main` is not modified** — you only push the feature branch and dispatch the
  workflow against it.
- **Apex / `www`** are unaffected (served from a different AWS account during the
  migration — see `filterboxbuilder-HANDOFF.md` §9).

## Manual fallback (only if the Action can't run)
Requires AWS credentials configured locally with the deploy permissions:

```sh
cd ~/Nukit-Air-Purifier-Builder
bun install && bun run build
aws s3 sync dist/ s3://filterboxbuilder-nukit --delete
aws cloudfront create-invalidation --distribution-id E3UC5U53489JKG --paths "/*"
```

(See `filterboxbuilder-HANDOFF.md` for full infrastructure details: AWS account,
IAM user, secrets, and DNS.)
