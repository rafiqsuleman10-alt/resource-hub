// Creates the four demo logins and loads the demo data.
//
//   npm run seed
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local
// or the environment). Safe to run again: existing demo logins get their
// password reset and all demo data is reloaded from scratch.
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/lib/demo";
import { toProjectUrl } from "../src/lib/supabase/env";

config({ path: ".env.local", quiet: true });

const url = toProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing settings. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local (see .env.example).",
  );
  process.exit(1);
}

// The service role key skips all security rules, so it must only ever be used
// in scripts like this one, never in the website itself.
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserId(email: string): Promise<string | undefined> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email === email);
    if (match) return match.id;
    if (data.users.length < 200) return undefined;
  }
}

async function main() {
  console.log("1/2  Demo logins");
  for (const account of DEMO_ACCOUNTS) {
    const existingId = await findUserId(account.email);
    if (existingId) {
      const { error } = await admin.auth.admin.updateUserById(existingId, {
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      console.log(`     updated  ${account.email}`);
    } else {
      const { error } = await admin.auth.admin.createUser({
        email: account.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      console.log(`     created  ${account.email}`);
    }
  }

  console.log("2/2  Demo data");
  const { data, error } = await admin.rpc("reset_demo_data");
  if (error) {
    if (error.code === "PGRST202") {
      throw new Error(
        "The reset_demo_data function isn't in the database. In the Supabase SQL Editor, run every file in " +
          "supabase/migrations in order (the demo data one is 20260923000002_demo_data.sql), then run this again. " +
          "If you already ran them, run  notify pgrst, 'reload schema';  there and try again.",
      );
    }
    throw error;
  }
  console.log(`     ${data}`);
  console.log(`\nDone. Log in with any demo account and the password ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error("\nSeeding failed:", err.message ?? err);
  process.exit(1);
});
