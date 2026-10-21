# authfly/authfly — the Authfly contract, providers and server SDKs

| Path | Package | What |
|---|---|---|
| `packages/core` | `@authfly/core` | The provider contract: **one JSON schema** (`schema/contract.json`) + capability flags + generated types. |
| `packages/provider-stalwart` | `@authfly/provider-stalwart` | Implemented. The contract over the Authfly server JSON API (`/api/v1`), which owns the Stalwart JMAP integration. |
| `packages/provider-supabase` | `@authfly/provider-supabase` | **Stub, not implemented** — every operation throws `not_implemented`, all flags false. |
| `packages/provider-authjs` | `@authfly/provider-authjs` | **Stub, not implemented** — same. |
| `packages/contract-tests` | `@authfly/contract-tests` | Provider-agnostic suite (`runContract(provider, fixture)`), plus `runStubCheck`. |
| `sdk/ts` | `@authfly/node` | TS server SDK: OIDC relying party (PKCE, ID-token verify, signed cookies) + JSON API client. |
| `sdk/go` | `github.com/authfly/authfly/sdk/go` | Go SDK: `authfly.New(url, key)` implements `contract.Provider`. |
| `sdk/python` | `authfly` (PyPI name, unpublished) | Python SDK + generated `authfly_contract.py` (TypedDicts + Provider Protocol). |
| `sdk/php` | `authfly/authfly` (Composer, unpublished) | PHP SDK + generated `Contract.php` (phpstan shapes + Provider interface). |

## The contract

Operations: `capabilities`, `signIn`, `signUp`, `verifyEmail`, `sendMagicLink`, `verifyMagicLink`, `resetPassword`
(request `{email}` / confirm `{email, token, password}`), `session`, `signOut` (every session), `exportUser`, `deleteUser`
(needs the password again). Errors are `AuthError{code, message}` with `code` in `invalid_credentials | unverified |
account_exists | invalid_token | invalid_input | mfa_required | unauthenticated | not_implemented | error`.

Capability flags: `magicLink`, `password`, `social`, `twoFactor` (2FA), `webauthn`. Widgets (authfly/authkit) read
only these flags — `widgetProps(caps)` in `@authfly/core` maps them to widget props — and never anything
provider-specific.

Types are generated: `bun run gen` (writes TS, Go, Python, PHP); `bun run check` fails when they are stale.

## Tests

    bun install && bun run check                 # gen --check, tsc, unit tests (TS, Go, Python, PHP)
    AUTHFLY_URL=http://localhost:4000 STALWART_URL=http://localhost:8080 AUTHFLY_DOMAIN=authfly.test bun run contract

`contract` needs a running Authfly + Stalwart (e.g. one deployed by `npx authfly deploy`, authfly/cli); the fixture
reads the mails back from Stalwart over JMAP as the test account. Stalwart must pass all; the stubs must answer
`not_implemented`.

License: MIT, © Auth Fly.
