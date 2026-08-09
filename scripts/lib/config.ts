import { config } from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";

function loadEnv() {
  const envLocal = readFileSync(join(process.cwd(), "apps/web/.env.local"), "utf8");
  for (const line of envLocal.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
  config();
}

loadEnv();

export const TEST_DOCTOR_ID = "3a8f5d9f-d667-4494-a044-11252eaff411";
export const TEST_EMAIL = "test.doctor.local@example.com";
export const TEST_PASSWORD = "TestDoctor123!";
export const TEST_NAME = "Test Doctor";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
