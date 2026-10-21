// NOT IMPLEMENTED. Placeholder so the contract tests can list it: every operation throws not_implemented and every
// capability flag is false.
import { notImplemented, type Provider } from "@authfly/core";

export const implemented = false;
export function supabaseProvider(): Provider {
  const ni = (op: string) => async () => notImplemented("supabase", op);
  return {
    id: "supabase",
    capabilities: async () => ({ magicLink: false, password: false, social: false, twoFactor: false, webauthn: false }),
    signIn: ni("signIn"), signUp: ni("signUp"), verifyEmail: ni("verifyEmail"), sendMagicLink: ni("sendMagicLink"), verifyMagicLink: ni("verifyMagicLink"),
    resetPassword: ni("resetPassword"), session: ni("session"), signOut: ni("signOut"), exportUser: ni("exportUser"), deleteUser: ni("deleteUser"),
  };
}
