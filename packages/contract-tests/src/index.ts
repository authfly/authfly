// The contract suite. A provider passes when every operation behaves as packages/core/schema/contract.json says.
// Operations behind a capability flag that the provider reports as false are skipped (and the suite checks they
// fail with not_implemented or a 4xx instead of silently succeeding).
import { AuthflyError, OPERATION_CAPABILITY, type Capabilities, type Operation, type Provider } from "@authfly/core";

/** What the suite needs from the environment around a provider: a way to read the mail it sends. */
export interface Fixture {
  /** a fresh, unused username (local part) */
  username(): string;
  /** the email address that username gets */
  address(username: string): string;
  /** body of the newest mail of a kind sent to the account after `after` (ms epoch) */
  inbox(username: string, password: string, kind: "verify" | "magic" | "reset", after: number): Promise<string>;
}

export interface Result { name: string; ok: boolean; skipped?: boolean; error?: string; ms: number }

const tokenIn = (mail: string) => {
  const m = mail.match(/https?:\/\/\S+/);
  if (!m) throw new Error("no link in mail");
  const t = new URL(m[0]).searchParams.get("token");
  if (!t) throw new Error("no token in link " + m[0]);
  return t;
};
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };
async function rejects(p: Promise<unknown>, codes: string[]) {
  try { await p; } catch (e) { if (e instanceof AuthflyError && codes.includes(e.code)) return; throw new Error(`wrong error: ${(e as Error).message}`); }
  throw new Error(`expected ${codes.join("|")}`);
}

export async function runContract(p: Provider, fx: Fixture, log = (r: Result) => console.log(`${r.skipped ? "skip" : r.ok ? "ok  " : "FAIL"} ${r.name}${r.error ? ": " + r.error : ""}`)): Promise<Result[]> {
  const out: Result[] = [];
  let caps!: Capabilities;
  const t = async (name: string, f: () => Promise<void>, needs?: keyof Capabilities) => {
    const s = Date.now();
    if (needs && caps && !caps[needs]) { const r = { name, ok: true, skipped: true, ms: 0 }; out.push(r); log(r); return; }
    try { await f(); const r = { name, ok: true, ms: Date.now() - s }; out.push(r); log(r); }
    catch (e) { const r = { name, ok: false, error: (e as Error).message, ms: Date.now() - s }; out.push(r); log(r); }
  };
  const user = fx.username(), pw = "Contract-" + Math.random().toString(36).slice(2) + "-9x", pw2 = pw + "-new";
  const addr = fx.address(user);
  let token = "";

  await t("capabilities: all five flags are booleans", async () => {
    caps = await p.capabilities();
    for (const k of ["magicLink", "password", "social", "twoFactor", "webauthn"] as const) assert(typeof caps[k] === "boolean", k);
  });
  let at = Date.now();
  await t("signUp creates an unverified user", async () => {
    const u = await p.signUp({ name: "Contract Test", username: user, password: pw, terms: "contract" });
    assert(u.id && u.email.toLowerCase() === addr.toLowerCase() && u.emailVerified === false, JSON.stringify(u));
  });
  await t("signUp twice is account_exists", () => rejects(p.signUp({ name: "x", username: user, password: pw }), ["account_exists"]));
  await t("signIn before verification is refused", () => rejects(p.signIn({ identifier: user, password: pw }), ["unverified", "invalid_credentials"]), "password");
  await t("verifyEmail with the mailed token", async () => {
    await rejects(p.verifyEmail({ token: "bogus" }), ["invalid_token"]);
    await p.verifyEmail({ token: tokenIn(await fx.inbox(user, pw, "verify", at)) });
  });
  await t("signIn with a wrong password is invalid_credentials", () => rejects(p.signIn({ identifier: user, password: "wrong-" + pw }), ["invalid_credentials"]), "password");
  await t("signIn returns a session", async () => {
    const s = await p.signIn({ identifier: user, password: pw });
    assert(s.token && s.user.emailVerified && s.user.email.toLowerCase() === addr.toLowerCase(), "session");
    token = s.token;
  }, "password");
  await t("sendMagicLink + verifyMagicLink returns a session (single use)", async () => {
    at = Date.now();
    const sent = await p.sendMagicLink({ identifier: addr });
    assert(sent.sentTo.toLowerCase() === addr.toLowerCase(), "sentTo " + sent.sentTo);
    const tok = tokenIn(await fx.inbox(user, pw, "magic", at));
    const s = await p.verifyMagicLink({ identifier: addr, token: tok });
    assert(s.token && s.user.email.toLowerCase() === addr.toLowerCase(), "session");
    await rejects(p.verifyMagicLink({ identifier: addr, token: tok }), ["invalid_token"]);
    token ||= s.token;
  }, "magicLink");
  await t("session resolves the token", async () => {
    const s = await p.session({ token });
    assert(s.user.email.toLowerCase() === addr.toLowerCase(), "user");
    await rejects(p.session({ token: "bogus" }), ["unauthenticated", "invalid_token"]);
  });
  await t("resetPassword: request, confirm, new password works", async () => {
    at = Date.now();
    await p.resetPassword({ email: addr });
    const tok = tokenIn(await fx.inbox(user, pw, "reset", at));
    await p.resetPassword({ email: addr, token: tok, password: pw2 });
    await rejects(p.signIn({ identifier: user, password: pw }), ["invalid_credentials"]);
    token = (await p.signIn({ identifier: user, password: pw2 })).token;
  }, "password");
  const cur = () => (out.find((r) => r.name.startsWith("resetPassword"))?.ok && !out.find((r) => r.name.startsWith("resetPassword"))?.skipped ? pw2 : pw);
  await t("exportUser returns the user and data", async () => {
    const e = await p.exportUser({ token });
    assert(e.user.email.toLowerCase() === addr.toLowerCase() && typeof e.data === "object", "export");
  });
  await t("signOut revokes the session", async () => {
    await p.signOut({ token });
    await rejects(p.session({ token }), ["unauthenticated", "invalid_token"]);
    if (caps.password) token = (await p.signIn({ identifier: user, password: cur() })).token;
    else { at = Date.now(); await p.sendMagicLink({ identifier: addr }); token = (await p.verifyMagicLink({ identifier: addr, token: tokenIn(await fx.inbox(user, cur(), "magic", at)) })).token; }
  });
  await t("deleteUser needs the password, then erases", async () => {
    await rejects(p.deleteUser({ token, password: "wrong-" + pw }), ["invalid_credentials", "invalid_input"]);
    await p.deleteUser({ token, password: cur() });
    await rejects(p.session({ token }), ["unauthenticated", "invalid_token"]);
    if (caps.password) await rejects(p.signIn({ identifier: user, password: cur() }), ["invalid_credentials"]);
  });
  await t("disabled capabilities are refused", async () => {
    for (const [op, flag] of Object.entries(OPERATION_CAPABILITY) as [Operation, keyof Capabilities][]) {
      if (caps[flag]) continue;
      const f = (p as any)[op].bind(p);
      try { await f({ identifier: addr, password: "x", email: addr, token: "x" }); throw new Error(`${op} succeeded while ${flag} is off`); }
      catch (e) { if (!(e instanceof AuthflyError)) throw e; }
    }
  });
  return out;
}

/** Every operation of a stub provider must say not_implemented. */
export async function runStubCheck(p: Provider): Promise<Result[]> {
  const ops = ["signIn", "signUp", "verifyEmail", "sendMagicLink", "verifyMagicLink", "resetPassword", "session", "signOut", "exportUser", "deleteUser"] as const;
  const out: Result[] = [];
  for (const op of ops) {
    const s = Date.now();
    try { await (p as any)[op]({}); out.push({ name: `${p.id}.${op}`, ok: false, error: "succeeded", ms: 0 }); }
    catch (e) { out.push({ name: `${p.id}.${op} → not_implemented`, ok: e instanceof AuthflyError && e.code === "not_implemented", ms: Date.now() - s }); }
  }
  const c = await p.capabilities();
  out.push({ name: `${p.id} capabilities all false`, ok: Object.values(c).every((v) => v === false), ms: 0 });
  return out;
}
