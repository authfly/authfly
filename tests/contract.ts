// Contract suite against real providers.
//   AUTHFLY_URL=http://localhost:4000 STALWART_URL=http://localhost:8080 AUTHFLY_DOMAIN=example.test bun tests/contract.ts
// Stalwart must pass every test; the supabase and authjs stubs must answer not_implemented everywhere.
import { stalwartProvider } from "@authfly/provider-stalwart";
import { supabaseProvider } from "@authfly/provider-supabase";
import { authjsProvider } from "@authfly/provider-authjs";
import { runContract, runStubCheck, type Fixture } from "@authfly/contract-tests";

const AUTHFLY = process.env.AUTHFLY_URL ?? "http://localhost:4000";
const STALWART = process.env.STALWART_URL ?? "http://localhost:8080";
const DOMAIN = process.env.AUTHFLY_DOMAIN ?? "authfly.test";
const SUBJECT = { verify: "Verify your email address", magic: "Your sign-in link", reset: "Reset your password" } as const;

/** Stalwart fixture: the mail is read back over JMAP as the account itself. */
export const stalwartFixture: Fixture = {
  username: () => "ct" + Math.random().toString(36).slice(2, 8),
  address: (u) => `${u}@${DOMAIN}`,
  async inbox(user, password, kind, after) {
    const auth = "Basic " + Buffer.from(`${user}@${DOMAIN}:${password}`).toString("base64");
    const session = (await (await fetch(`${STALWART}/jmap/session`, { headers: { Authorization: auth } })).json()) as any;
    const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];
    for (let i = 0; i < 60; i++) {
      const r = (await (await fetch(`${STALWART}/jmap`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify({
        using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
        methodCalls: [["Email/query", { accountId, filter: { subject: SUBJECT[kind] }, sort: [{ property: "receivedAt", isAscending: false }], limit: 1 }, "a"],
          ["Email/get", { accountId, "#ids": { resultOf: "a", name: "Email/query", path: "/ids" }, properties: ["receivedAt", "bodyValues", "textBody"], fetchTextBodyValues: true }, "b"]],
      }) })).json()) as any;
      const m = r.methodResponses[1]?.[1].list?.[0];
      if (m && Date.parse(m.receivedAt) >= after - 2000) return Object.values<any>(m.bodyValues).map((b) => b.value).join("\n");
      await Bun.sleep(500);
    }
    throw new Error(`no "${SUBJECT[kind]}" mail for ${user}`);
  },
};

let fail = 0;
console.log(`# stalwart (${AUTHFLY})`);
for (const r of await runContract(stalwartProvider({ url: AUTHFLY, apiKey: process.env.AUTHFLY_API_KEY }), stalwartFixture)) if (!r.ok) fail++;
for (const p of [supabaseProvider(), authjsProvider()]) {
  console.log(`# ${p.id} (stub)`);
  for (const r of await runStubCheck(p)) { console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}`); if (!r.ok) fail++; }
}
console.log(fail ? `${fail} FAILED` : "contract: all passed");
process.exit(fail ? 1 : 0);
