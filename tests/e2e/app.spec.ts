import { expect, test } from "@playwright/test";

test.describe("Field Tracer editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#map .maplibregl-canvas")).toBeVisible();
  });

  test("renders the annotation workspace", async ({ page }) => {
    await expect(page).toHaveTitle(/Field Tracer/);
    await expect(page.getByRole("heading", { name: "Field Tracer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Central Illinois pilot" })).toBeVisible();
    await expect(page.getByText("EOxCloudless · Sentinel-2 2025")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload to OSM" })).toBeDisabled();
  });

  test("enters and exits polygon drawing mode", async ({ page }) => {
    const drawButton = page.getByRole("button", { name: "Draw field polygon" });
    await drawButton.click();
    await expect(page.getByRole("button", { name: "Drawing field…" })).toBeVisible();
    await expect(page.getByText("0 points · double-click to close")).toBeVisible();

    await page.getByRole("button", { name: "Drawing field…" }).click();
    await expect(page.getByRole("button", { name: "Draw field polygon" })).toBeVisible();
    await expect(page.getByText("Click around a field. Double-click to close it.")).toBeVisible();
  });

  test("rejects an undersized polygon before upload", async ({ page }) => {
    await page.getByRole("button", { name: "Draw field polygon" }).click();
    const map = page.locator("#map .maplibregl-canvas");
    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const centerX = box.x + box.width * 0.5;
    const centerY = box.y + box.height * 0.5;
    await page.mouse.click(centerX, centerY);
    await page.mouse.click(centerX + 1, centerY);
    await page.mouse.click(centerX + 1, centerY + 1);
    await page.getByRole("button", { name: "Finish current polygon" }).click();

    await expect(page.getByRole("status")).toContainText("Needs another pass");
    await expect(page.getByRole("status")).toContainText("below 400 m²");
    await expect(page.locator("#field-count")).toHaveText("0");
  });

  test("requires OAuth configuration before starting OSM login", async ({ page }) => {
    await page.getByRole("button", { name: /Continue with OpenStreetMap/ }).click();
    await expect(page.getByRole("status")).toContainText("Set VITE_OSM_CLIENT_ID");
  });

  test("keeps upload disabled until a field and OSM session exist", async ({ page }) => {
    const upload = page.getByRole("button", { name: "Upload to OSM" });
    await expect(upload).toBeDisabled();
    await expect(page.getByText("No OSM session · EOX imagery active")).toBeVisible();
  });
});
