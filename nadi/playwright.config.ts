import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run the production build against e2e/mock-supabase.mjs.
// Build first with the same NEXT_PUBLIC_* values (they are inlined at build
// time): `npm run build:e2e && npm run test:e2e`.
export const E2E_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon",
  SUPABASE_SERVICE_ROLE_KEY: "e2e-service",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
};

// UNIT_ONLY=1 runs tests/ alone, without building or starting anything.
const unitOnly = !!process.env.UNIT_ONLY;

export default defineConfig({
  timeout: 60_000,
  workers: 1, // the e2e tests share one mock database
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "unit", testDir: "tests" },
    ...(unitOnly ? [] : [{ name: "e2e", testDir: "e2e" }]),
  ],
  webServer: unitOnly ? undefined : [
    { command: "node e2e/mock-supabase.mjs", url: "http://localhost:54321/__orders", reuseExistingServer: !process.env.CI },
    {
      command: "npx next start -p 3100",
      url: "http://localhost:3100/login",
      env: E2E_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
