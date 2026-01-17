# Presto Auth

Hosts the presto installer at `presto.tempo.xyz`.

## What It Does

- **`/install.sh`** - Bash installer that downloads and installs presto via uv/pipx
- **`/presto_tempo-*.whl`** - Python wheel file served as static asset
- **`/`** - Landing page with install instructions
- **`/health`** - Health check endpoint

All endpoints are free (no payment required).

## Install Presto

```bash
curl -fsSL https://presto.tempo.xyz/install.sh | bash
```

Or install directly with uv/pipx:
```bash
uv tool install https://presto.tempo.xyz/presto_tempo-0.1.0-py3-none-any.whl
```

## Development

```bash
# Build wheel from local presto repo
./scripts/build-wheel.sh ../../../presto

# Start dev server
pnpm --filter @tempo/presto-auth dev
```

## How It Works

1. CI clones the `tempoxyz/presto` repo on each deploy
2. Builds the Python wheel using `uv build`
3. Deploys the wheel as a static asset alongside the Worker
4. The install script downloads the wheel directly from `presto.tempo.xyz`

## Deployment

Automatic on merge to main. Manual deploy:

```bash
# Build wheel first
./scripts/build-wheel.sh

# Deploy
pnpm --filter @tempo/presto-auth deploy:mainnet
```
