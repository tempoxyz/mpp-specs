# mpp-specs

The IETF Internet-Drafts that define the Machine Payments Protocol: the `Payment` HTTP authentication scheme, its intents, payment methods and extensions, written in kramdown-rfc Markdown and published at [paymentauth.org](https://paymentauth.org). Every MPP SDK implements these drafts.

## Commands

```bash
make docker-build   # build the ietf-spec-tools image (kramdown-rfc, xml2rfc, rfclint, pytest); once, and after Dockerfile changes
make lint           # frontmatter, JSON examples, external section refs, encoded examples, problem types
make test           # pytest over scripts/ (scripts/test_*.py)
make check          # build every draft to XML/HTML/TXT/PDF in artifacts/, then rfclint the XML
make build          # build only (scripts/gen.sh in Docker)
make site           # build, generate the index and problem pages, serve them locally
make codeowners     # regenerate .github/CODEOWNERS from who submitted each spec; needs full git history
```

CI (`pr-check.yml`) runs the same steps inside the Docker image. Run one script test with `docker run --rm -v "$(pwd)":/data -w /data/scripts ietf-spec-tools pytest -v test_lint_frontmatter.py`. Everything runs in Docker; without it, `bundle install` and `pip install -r requirements.txt` and then `./scripts/gen.sh` (or `make build-local`) build locally. No test needs a localnet or secrets.

## Layout

- `specs/core/`: the scheme itself, `draft-httpauth-payment-NN.md`.
- `specs/intents/`: standardized payment intents (`draft-payment-intent-{name}-NN.md`).
- `specs/methods/<network>/`: payment methods, one draft per intent (`draft-{network}-{intent}-NN.md`, such as `tempo/draft-tempo-charge-00.md`).
- `specs/extensions/`: optional extensions (`draft-payment-discovery-NN.md`) and `transports/` (MCP).
- `examples/`: templates for new intents, methods and extensions, with the required sections per track (`examples/README.md`).
- `scripts/`: `gen.sh` (Markdown → XML → HTML/TXT/PDF), `check.sh`, the `lint_*.py` linters and their `test_*.py`, `bump_and_rename.sh`, `gen_index.py` and `gen_problems.py` for the site, `serve.py`.
- `pages/templates/`: HTML templates for the paymentauth.org index and `/problems/` pages.
- `artifacts/`: generated output (gitignored).
- `.agents/skills/reviewing-ietf-drafts/`: agent skill for reviewing drafts for RFC style, clarity and publication readiness; load it when reviewing or editing a draft. `./scripts/install-skills.sh` installs it globally.
- [STYLE.md](./STYLE.md): design principles, RFC writing conventions and the versioning strategy. [CONTRIBUTING.md](./CONTRIBUTING.md): where to contribute and the PR checklist.

## Conventions

- A modified draft bumps its revision: rename the file (`-00` → `-01`) and update `docname` and `version` in its frontmatter to match. `scripts/bump_and_rename.sh` does this for the core draft.
- New intents, methods and extensions start from the matching template in `examples/`. A method may define a new intent in its own draft (experimental); extract it to `specs/intents/` once two or more methods implement it. Core protocol changes start with an issue.
- Frontmatter needs `title`, `abbrev`, `docname`, `version`, `category`, `ipr` (`noModificationTrust200902`), `submissiontype`, `consensus` and `author` (`name`, `ins`, `email`, `org` in that order); `lint_frontmatter.py` enforces it.
- Avoid new hardcoded external section references such as `Section X.Y of {{I-D...}}`; allowed ones are listed in `scripts/allowed_external_section_refs.txt`.
- Write in RFC 7322 style with RFC 2119/8174 keywords, terms defined before use, and Security and IANA Considerations in every draft (STYLE.md). Keep Markdown source lines under 72 characters.
- JSON and encoded examples must be valid and decode to what they claim; problem types used in drafts must have pages (`lint_problem_types.py`).
- Cross-references flow downward: core → intents → methods.
- Versioning: the core carries no wire version, intents carry none, and methods may add `methodDetails.version` (absent means 1) for breaking changes. Implementations ignore unknown fields.
- Disclose significant AI assistance in the PR description.

## Pull requests and publishing

- `pr-check.yml` builds and lints every PR, diffs each draft's TXT against the latest `main` deploy, and uploads the renderings; `pr-comment.yml` then publishes them as a `pr-<N>-spec-preview` prerelease and comments the links on the PR. `pr-preview-cleanup.yml` deletes that release when the PR closes.
- `deploy.yml` on `main` builds the drafts, publishes a `spec-artifacts-<sha>` release and deploys paymentauth.org (GitHub Pages) with the index and problem pages.
- `submit-draft.yml` submits the core draft to the IETF datatracker when a revision bump of `specs/core/draft-httpauth-payment-*.md` lands on `main`; the local revision must be exactly one past the published one, and an author confirms by email. `resubmit-draft.yml` checks weekly and opens a bump PR within 35 days of the draft's 185-day expiry.

<!-- BEGIN MPP SHARED: synced from tempoxyz/mpp-tools agents/shared.md. Edit it there; changes here are overwritten. -->

## MPP

Conventions every MPP repository shares, pulled together from their AGENTS.md files. Synced from [`agents/shared.md`](https://github.com/tempoxyz/mpp-tools/blob/main/agents/shared.md) in tempoxyz/mpp-tools: edit it there. The sections above it are this repository's own and win where they are more specific.

### This file

- Keep it to `# <repository>` and a short paragraph, then `## Commands`, `## Layout`, `## Conventions`, then only the sections this repository needs, then this section.
- Write rules an agent can act on: commands, paths, constraints. Leave out background, history and anything the code, specs or README already say.
- When you learn a convention the hard way, add it to the section it belongs to in the same pull request.

### Code

- Make the smallest change that does the job and follow the surrounding code. Start concrete; extract an abstraction only once several real uses share it.
- Keep the public API narrow. Add rather than remove or rename, and mark what you replace as deprecated before deleting it.
- Document every exported item (JSDoc, rustdoc, docstrings, Go doc comments). Comments say why, not what.
- Match mppx, the reference SDK: its names (Challenge, Credential, Receipt, Method), defaults, errors and behavior, unless the language forces otherwise; say why when it does.
- The IETF drafts in tempoxyz/mpp-specs (paymentauth.org) are the source of truth for the protocol, and mppx settles what they leave open. Link them instead of restating them.
- Add no dependency without a reason the pull request states. Prefer the standard library and what the repository already uses.
- Never log or commit keys, credentials, signatures, authorization headers or raw upstream errors.
- Tempo chain IDs: mainnet `4217`, Moderato testnet `42431`. Never `98865`.

### Tooling

Use each language's standard toolchain, run through the commands in `## Commands`, and keep it clean with warnings as errors:

- TypeScript: pnpm, strict `tsc`, ESM with `.js` relative imports, the repository's configured formatter and linter, Vitest.
- Python: uv, ruff (format and lint), a strict type checker (pyright or ty), pytest or unittest.
- Rust: cargo, `cargo fmt`, `cargo clippy -D warnings`, `cargo test`.
- Go: `gofmt`, `go vet`, golangci-lint, `go test -race`.
- Swift: SwiftPM, `swift test -Xswiftc -warnings-as-errors`.
- Run the checks that cover your change before opening a pull request, and add tests for behavior that matters, next to the existing ones.
- Pin GitHub Actions by full commit SHA. Workflows start with `tempoxyz/gh-actions/actions/secure-runner` and get write tokens from GitHub STS policies in `.github/sts/`, never stored secrets.

### Changes

- Commits and pull request titles use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, optionally scoped.
- Never edit `CHANGELOG.md` by hand. Record a release note the way `## Conventions` says (changeset, `.changelog/` fragment, or none when a workflow writes it), in the past tense.
- Before 1.0, bump `patch` for everything except a breaking public API change, which is `minor`.
- Don't edit README files unless asked.
- Never force-push.

### Docs and prose

- Active voice, present tense, second person. Sentence-case headings. No filler (just, simply, easily) and no Latin abbreviations.
- Capitalize Challenge, Credential and Receipt as MPP concepts. Say stablecoins, not crypto, and USDC.e for bridged USDC on Tempo. Write `mppx` in lowercase.

<!-- END MPP SHARED -->
