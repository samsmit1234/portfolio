import { expect, test, type BrowserContext } from "@playwright/test";

const MOCK = "http://localhost:54321";

/** A Supabase session cookie the mock accepts (it never checks the token). */
async function logIn(context: BrowserContext) {
  const session = {
    access_token: "e2e",
    refresh_token: "e2e",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "11111111-1111-1111-1111-111111111111", aud: "authenticated", email: "chef@example.com" },
  };
  await context.addCookies([
    {
      name: "sb-localhost-auth-token",
      value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      domain: "localhost",
      path: "/",
    },
  ]);
}

test.beforeEach(async () => {
  await fetch(`${MOCK}/__reset`);
});

test("staff creates an order, customer follows it, Ready reaches the customer", async ({ browser }) => {
  const staff = await browser.newContext();
  await logIn(staff);
  const board = await staff.newPage();
  await board.goto("/dashboard");

  // Create order 77: the QR modal opens with the customer link.
  await board.getByRole("textbox", { name: "N° de commande" }).fill("77");
  await board.getByRole("button", { name: /Créer/ }).click();
  const dialog = board.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const [order] = await (await fetch(`${MOCK}/__orders`)).json();
  expect(order.number).toBe("77");
  await dialog.getByRole("button", { name: "Fermer" }).click();

  // The customer opens /o/{id}.
  const customerContext = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const customer = await customerContext.newPage();
  await customer.goto(`/o/${order.id}`);
  await expect(customer.getByText("77", { exact: true })).toBeVisible();
  await expect(customer.getByText("En préparation")).toBeVisible();

  // Staff marks it ready; the customer page switches to the ready state on its own.
  await board.getByRole("button", { name: "Prête", exact: true }).click();
  await expect.poll(async () => (await (await fetch(`${MOCK}/__orders`)).json())[0].status).toBe("ready");
  // No Realtime in the mock: this exercises the 15 s polling fallback.
  await expect(customer.getByText("Votre commande est prête")).toBeVisible({ timeout: 25_000 });
  await expect(customer.getByText("En préparation")).toHaveCount(0);

  await staff.close();
  await customerContext.close();
});

test("an unknown order id shows the not-found message", async ({ page }) => {
  await page.goto("/o/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("introuvable", { exact: false })).toBeVisible();
});
