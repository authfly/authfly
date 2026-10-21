// @authfly/provider-stalwart: the contract implemented over the Authfly server's JSON API (/api/v1). The server is
// the Stalwart integration (accounts and passwords in Stalwart over JMAP, mail via Stalwart SMTP, verified erasure);
// this adapter never talks JMAP itself, so it holds no Stalwart credentials.
import { AuthflyError, type Capabilities, type DeleteUserInput, type Export, type MagicLinkInput, type Ok, type Provider, type ResetPasswordInput,
  type Sent, type Session, type SignInInput, type SignUpInput, type TokenInput, type User } from "@authfly/core";

export interface StalwartProviderOptions {
  /** Authfly server URL, e.g. https://auth.example.com */
  url: string;
  /** optional AUTHFLY_API_KEY of the server */
  apiKey?: string;
}

type Raw = { sub: string; email: string; username?: string; name: string; email_verified: boolean; amr?: string };
const user = (u: Raw): User => ({ id: u.sub, email: u.email, username: u.username, name: u.name, emailVerified: u.email_verified });
const session = (j: { token: string; user: Raw }): Session => ({ token: j.token, user: user(j.user), method: (j.user.amr as Session["method"]) ?? undefined });

export function stalwartProvider(o: StalwartProviderOptions): Provider {
  const base = o.url.replace(/\/$/, "") + "/api/v1";
  async function call<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const r = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(o.apiKey ? { "X-Authfly-Key": o.apiKey } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as any;
    if (!r.ok) throw new AuthflyError(j.error ?? (r.status === 404 ? "not_implemented" : "error"), j.message ?? `HTTP ${r.status}`, r.status);
    return j as T;
  }
  return {
    id: "stalwart",
    async capabilities(): Promise<Capabilities> {
      try {
        return await call<Capabilities>("GET", "/capabilities");
      } catch (e) {
        // servers before 0.3.2 have no /capabilities: derive the flags from /config
        if (!(e instanceof AuthflyError) || e.status !== 404) throw e;
        const c = await call<{ methods: string[] }>("GET", "/config");
        return { magicLink: c.methods.includes("magic_link"), password: c.methods.includes("password"), social: false, twoFactor: false, webauthn: false };
      }
    },
    async signIn(i: SignInInput) { return session(await call("POST", "/sign-in", i)); },
    async signUp(i: SignUpInput) { return user((await call<{ user: Raw }>("POST", "/sign-up", i)).user); },
    async verifyEmail(i: TokenInput): Promise<Ok> { await call("POST", "/verify-email", { token: i.token }); return { ok: true }; },
    async sendMagicLink(i: MagicLinkInput): Promise<Sent> { return { sentTo: (await call<{ sent_to: string }>("POST", "/magic-link", { identifier: i.identifier })).sent_to }; },
    async verifyMagicLink(i: MagicLinkInput) { return session(await call("POST", "/magic-link/verify", { token: i.token })); },
    async resetPassword(i: ResetPasswordInput): Promise<Ok> {
      if (i.token) await call("POST", "/reset", { token: i.token, password: i.password });
      else await call("POST", "/forgot", { email: i.email });
      return { ok: true };
    },
    async session(i: TokenInput) { return { token: i.token, user: user((await call<{ user: Raw }>("GET", "/me", undefined, i.token)).user) }; },
    async signOut(i: TokenInput): Promise<Ok> { await call("POST", "/me/sign-out-everywhere", {}, i.token); return { ok: true }; },
    async exportUser(i: TokenInput): Promise<Export> {
      // authfly-export/1: Stalwart account record (no credentials), Authfly records, audit trail, mailbox
      const me = await call<{ user: Raw }>("GET", "/me", undefined, i.token);
      return { user: user(me.user), data: await call<Record<string, unknown>>("GET", "/me/export", undefined, i.token) };
    },
    async deleteUser(i: DeleteUserInput): Promise<Ok> { await call("DELETE", "/me", { password: i.password }, i.token); return { ok: true }; },
  };
}
