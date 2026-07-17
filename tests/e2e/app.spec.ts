import { expect, test } from "@playwright/test";

test.describe("Field Tracer editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("field-tracer-tutorial-seen", "true"));
    await page.goto("/");
    await expect(page.locator("#map .maplibregl-canvas")).toBeVisible();
  });

  test("renders the annotation workspace", async ({ page }) => {
    await expect(page).toHaveTitle(/Field Tracer/);
    await expect(page.getByRole("heading", { name: "Field Tracer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Central Illinois pilot" })).toBeVisible();
    await expect(page.getByText("EOxCloudless · Sentinel-2 mosaic")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload to OSM" })).toBeDisabled();
  });

  test("enters and exits polygon drawing mode", async ({ page }) => {
    const drawButton = page.getByRole("button", { name: "Draw field polygon" });
    await drawButton.click();
    await expect(page.getByRole("button", { name: "Drawing field…" })).toBeVisible();
    await expect(page.getByText("0 points · click Undo point or press ⌘/Ctrl+Z")).toBeVisible();

    await page.getByRole("button", { name: "Drawing field…" }).click();
    await expect(page.getByRole("button", { name: "Draw field polygon" })).toBeVisible();
    await expect(page.getByText("Click around a field. Double-click to close it.")).toBeVisible();
  });

  test("offers circular field drawing", async ({ page }) => {
    await page.getByLabel("Shape").selectOption("circle");
    await expect(page.getByRole("button", { name: "Draw circular field" })).toBeVisible();
    await expect(page.getByText("Choose Circle, then drag from the field center to set the radius.")).toBeVisible();
    await page.getByRole("button", { name: "Draw circular field" }).click();
    await expect(page.getByText("Drag from the field center to set the radius. Release to finish.")).toBeVisible();
  });

  test("offers rectangular fields, snapping, comparison, and conservative geometry tools", async ({ page }) => {
    await page.getByLabel("Shape").selectOption("rectangle");
    await expect(page.getByRole("button", { name: "Draw rectangular field" })).toBeVisible();
    await expect(page.getByLabel("Snap to task and traced fields")).toBeChecked();
    await page.getByRole("button", { name: "Draw rectangular field" }).click();
    await expect(page.getByText("Drag from one field corner to the opposite corner. Release to finish.")).toBeVisible();

    await page.getByLabel("Blend a second mosaic year").check();
    await page.locator("#comparison-year").evaluate((element: HTMLInputElement) => {
      element.value = "2021";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(page.locator("#comparison-year-value")).toHaveText("2021");
    await expect(page.getByRole("button", { name: "Flicker comparison" })).toBeVisible();
    await expect(page.getByLabel("Brightness")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review task before upload" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark task reviewed — no fields visible" })).toBeVisible();
  });

  test("undoes a point and cancels the current polygon", async ({ page }) => {
    await page.getByRole("button", { name: "Draw field polygon" }).click();
    const map = page.locator("#map .maplibregl-canvas");
    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(page.getByRole("button", { name: "Undo point" })).toBeEnabled();
    await expect(page.getByText("1 points · click Undo point or press ⌘/Ctrl+Z")).toBeVisible();

    await page.getByRole("button", { name: "Undo point" }).click();
    await expect(page.getByText("0 points · click Undo point or press ⌘/Ctrl+Z")).toBeVisible();

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Click around a field. Double-click to close it.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo point" })).toBeDisabled();
  });

  test("exposes safe field recovery controls", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Remove selected field" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Undo last field" })).toBeDisabled();
    await expect(page.getByText("None selected")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clean geometry" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Split selected field with a line" })).toBeDisabled();
  });

  test("opens the concise labeling guide and imagery checklist", async ({ page }) => {
    await page.getByRole("button", { name: "Open labeling guide" }).click();
    await expect(page.getByRole("dialog")).toContainText("Make the field call");
    await expect(page.getByRole("dialog")).toContainText("Does time agree?");
    await page.getByRole("button", { name: "Close labeling guide" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByLabel("Compared a second time window")).toBeVisible();
  });

  test("browses the interactive workflow and visual examples", async ({ page }) => {
    await page.getByRole("button", { name: "Open labeling guide" }).click();
    await expect(page.getByRole("button", { name: "1 Is it managed?" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Does time agree?" })).toBeVisible();
    await page.getByRole("tab", { name: "Visual examples" }).click();
    await expect(page.getByRole("button", { name: "All examples" })).toBeVisible();
    await expect(page.getByAltText(/A difficult boundary/)).toBeVisible();
    await page.getByRole("button", { name: "Imagery", exact: true }).click();
    await expect(page.getByAltText(/Use NIR for subtle edges/)).toBeVisible();
    await page.getByRole("tab", { name: "Walkthrough videos" }).click();
    await expect(page.locator("video")).toHaveCount(3);
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

    await expect(page.locator("#toast")).toContainText("Needs another pass");
    await expect(page.locator("#toast")).toContainText("below 400 m²");
    await expect(page.locator("#field-count")).toHaveText("0");
  });

  test("requires OAuth configuration before starting OSM login", async ({ page }) => {
    await page.getByRole("button", { name: /Continue with OpenStreetMap/ }).click();
    await expect(page.locator("#toast")).toContainText("Set VITE_OSM_CLIENT_ID");
  });

  test("keeps upload disabled until a field and OSM session exist", async ({ page }) => {
    const upload = page.getByRole("button", { name: "Upload to OSM" });
    await expect(upload).toBeDisabled();
    await expect(page.getByText("No OSM session · EOX imagery active")).toBeVisible();
  });
});
