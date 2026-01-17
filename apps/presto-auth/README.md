# Presto Auth

Static wallet connect page for Presto AI agent.

## What It Does

Browser-based wallet setup flow for Presto CLI:

1. User runs `presto` CLI
2. CLI opens browser to `https://auth.tempo.xyz/?callback=http://localhost:PORT/callback&network=moderato`
3. User creates/signs in with passkey wallet (WebAuthn)
4. User creates time-limited access key (24h expiry)
5. Credentials POST back to localhost callback
6. CLI saves credentials and starts working

## Local Development

```bash
# Start local server
pnpm --filter @tempo/presto-auth dev
# Opens http://localhost:8788

# Test with Presto CLI (in presto repo)
PRESTO_AUTH_URL=http://localhost:8788 presto --dev
```

## Deployment

Deployed to Cloudflare Pages at `auth.tempo.xyz`.

```bash
# Preview
pnpm --filter @tempo/presto-auth deploy:preview

# Production  
pnpm --filter @tempo/presto-auth deploy:prod
```

## Technical Details

- **No backend** - Pure client-side JavaScript
- **Dependencies** - viem from esm.sh CDN (no build step)
- **Auth** - WebAuthn passkeys (device-native biometrics)
- **Blockchain** - Tempo access keys (24h expiry, scoped signing)
