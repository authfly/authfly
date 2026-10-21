export * from "./contract";
import type { AuthError, Capabilities } from "./contract";

/** Thrown by every provider adapter; `code` is one of the contract's AuthError codes. */
export class AuthflyError extends Error implements AuthError {
  constructor(readonly code: AuthError["code"], message: string, readonly status = 400) { super(message); }
}

export const notImplemented = (provider: string, op: string): never => {
  throw new AuthflyError("not_implemented", `${provider}: ${op} is not implemented`, 501);
};

/**
 * Widget props from capability flags — the only thing the widgets need from a provider.
 * sign-in: `method` (password | magic) and `social` (show | none); account: the sign-in methods list.
 */
export function widgetProps(c: Capabilities) {
  return {
    signIn: { method: c.password ? "password" : "magic", social: c.social ? "show" : "none", magicLink: c.magicLink },
    account: {
      methods: [
        { id: "password", title: "Password", text: c.password ? "On" : "Off", icon: "key-round" },
        { id: "magic", title: "Magic link", text: c.magicLink ? "On" : "Off", icon: "mail" },
        { id: "totp", title: "Authenticator app", text: c.twoFactor ? "On" : "Soon", icon: "smartphone" },
        { id: "webauthn", title: "Security key", text: c.webauthn ? "On" : "Soon", icon: "key" },
      ],
    },
  } as const;
}
