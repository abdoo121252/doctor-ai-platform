import "./lib/polyfill";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD } from "./lib/config";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`  PASS  ${name}`);
}

function bad(name: string, detail?: string) {
  failed++;
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    console.log("SIGN IN FAILED:", error?.message ?? "no session");
    process.exit(1);
  }
  const session = data.session;
  const projectRef = SUPABASE_URL.split(".")[0].replace("https://", "");
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieValue = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Math.floor((Date.now() + 3600_000) / 1000),
      expires_in: 3600,
      token_type: "bearer",
      user: session.user,
    })
  );
  const authCookie = `${cookieName}=${cookieValue}`;

  // 1. Unauthorized → middleware redirects to /login (307). GET to avoid the
//    dev-server "Failed to find Server Action" quirk on page-route POSTs.
  {
    const res = await fetch(`${BASE_URL}/api/parse`, { redirect: "manual" });
    if (res.status === 307 && (res.headers.get("location") ?? "").includes("/login")) {
      ok("307 redirect without session");
    } else bad("307 redirect without session", `got ${res.status} ${res.headers.get("location")}`);
  }

  // 2. Multipart small text file → 200 + markdown
  {
    const form = new FormData();
    form.append("file", new Blob(["Hello, doctor\nThis is a note."]), "note.txt");
    const res = await fetch(`${BASE_URL}/api/parse`, {
      method: "POST",
      headers: { Cookie: authCookie },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 200 && json.markdown?.includes("Hello, doctor")) {
      ok("multipart txt → markdown");
    } else bad("multipart txt → markdown", `status ${res.status}, markdown=${JSON.stringify(json.markdown)}`);
  }

  // 3. Multipart > 4.5MB → 413 with the exact message
  {
    const big = Buffer.alloc(5 * 1024 * 1024, 0x61).toString("utf8");
    const form = new FormData();
    form.append("file", new Blob([big]), "big.txt");
    const res = await fetch(`${BASE_URL}/api/parse`, {
      method: "POST",
      headers: { Cookie: authCookie },
      body: form,
    });
    const json = await res.json().catch(() => ({}));
    const expected =
      "File exceeds 4.5MB direct upload limit. Please provide a fileUrl instead.";
    if (res.status === 413 && json.error === expected) {
      ok("oversized multipart → 413 exact message");
    } else bad("oversized multipart → 413", `status ${res.status}, error=${JSON.stringify(json.error)}`);
  }

  // 4. JSON fileUrl mode (network-dependent, gate on server reachability)
  {
    const url = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
    try {
      const res = await fetch(`${BASE_URL}/api/parse`, {
        method: "POST",
        headers: { Cookie: authCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: url, fileName: "dummy.pdf" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 200 && typeof json.markdown === "string" && json.markdown.length > 0) {
        ok("JSON fileUrl → markdown");
      } else bad("JSON fileUrl → markdown", `status ${res.status}, error=${JSON.stringify(json.error)}`);
    } catch (err) {
      bad("JSON fileUrl → markdown", String(err));
    }
  }

  // 5. Unsupported format → 415
  {
    const form = new FormData();
    form.append("file", new Blob([Buffer.from([0x50, 0x4b, 0x03, 0x04])]), "archive.zip");
    const res = await fetch(`${BASE_URL}/api/parse`, {
      method: "POST",
      headers: { Cookie: authCookie },
      body: form,
    });
    if (res.status === 415) ok("unsupported format → 415");
    else bad("unsupported format → 415", `got ${res.status}`);
  }

  // 6. Missing file/fileUrl → 400
  {
    const res = await fetch(`${BASE_URL}/api/parse`, {
      method: "POST",
      headers: { Cookie: authCookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.status === 400) ok("empty JSON → 400");
    else bad("empty JSON → 400", `got ${res.status}`);
  }

  console.log(`=== ${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${passed} passed) ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});