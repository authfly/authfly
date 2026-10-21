import { expect, test } from "bun:test";
import { AuthflyError, OPERATION_CAPABILITY, widgetProps } from "@authfly/core";
import { stalwartProvider } from "@authfly/provider-stalwart";
import schema from "../../packages/core/schema/contract.json";

test("schema lists the contract operations", () => {
  for (const op of ["signIn", "signUp", "sendMagicLink", "resetPassword", "session", "signOut", "exportUser", "deleteUser"]) expect(schema.operations).toHaveProperty(op);
  expect(Object.keys(schema.$defs.Capabilities.properties)).toEqual(["magicLink", "password", "social", "twoFactor", "webauthn"]);
  expect(OPERATION_CAPABILITY.signIn).toBe("password");
});

test("widgetProps follows the flags", () => {
  const p = widgetProps({ magicLink: true, password: false, social: false, twoFactor: false, webauthn: false });
  expect(p.signIn.method).toBe("magic");
  expect(p.signIn.social).toBe("none");
  expect(widgetProps({ magicLink: true, password: true, social: true, twoFactor: false, webauthn: false }).signIn).toEqual({ method: "password", social: "show", magicLink: true });
});

test("stalwart provider maps the API (mock fetch)", async () => {
  const seen: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push(`${init.method} ${new URL(url).pathname}`);
    const path = new URL(url).pathname;
    if (path.endsWith("/capabilities")) return new Response("404", { status: 404 });
    if (path.endsWith("/config")) return Response.json({ methods: ["magic_link"] });
    if (path.endsWith("/sign-in")) return Response.json({ error: "invalid_credentials", message: "no" }, { status: 401 });
    return Response.json({ token: "t", user: { sub: "s", email: "a@x", name: "A", email_verified: true, amr: "magic" } });
  }) as typeof fetch;
  const p = stalwartProvider({ url: "http://af.test/" });
  expect(await p.capabilities()).toEqual({ magicLink: true, password: false, social: false, twoFactor: false, webauthn: false });
  const s = await p.verifyMagicLink({ identifier: "a", token: "x" });
  expect(s.user.id).toBe("s");
  expect(s.method).toBe("magic");
  const err = await p.signIn({ identifier: "a", password: "b" }).catch((e) => e);
  expect(err).toBeInstanceOf(AuthflyError);
  expect(err.code).toBe("invalid_credentials");
  expect(seen).toContain("POST /api/v1/magic-link/verify");
});
