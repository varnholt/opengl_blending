const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("http://127.0.0.1:8937");
  await expect(page.locator("#download")).toBeEnabled();
});

test("presets, custom equations, reset and responsive layout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator("#source-factor")).toHaveValue("SrcAlphaFactor");
  await expect(page.locator("#destination-factor")).toHaveValue(
    "OneMinusSrcAlphaFactor",
  );
  await expect(page.locator("#code")).toContainText(
    "GL_ONE, GL_ONE_MINUS_SRC_ALPHA",
  );
  for (const preset of [
    "additive",
    "multiply",
    "subtractive",
    "replace",
    "custom",
    "normal",
  ]) {
    await page.selectOption("#preset", preset);
    await expect(page.locator("#preset")).toHaveValue(preset);
  }
  await page.selectOption("#equation", "MinEquation");
  await expect(page.locator("#source-factor")).toBeDisabled();
  await expect(page.locator("#formula")).toHaveText("RGB = min(S, D)");
  await page.selectOption("#equation", "AddEquation");
  await expect(page.locator("#source-factor")).toBeEnabled();
  await page.click("#swap");
  await expect(page.locator("#source-name")).toHaveText("Texture 1 · default");
  await page.click("#reset");
  await expect(page.locator("#source-name")).toHaveText("Texture 2 · default");
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("uploaded textures produce correct blend pixels and export", async ({
  page,
}) => {
  const png = async (color) =>
    Buffer.from(
      await page.evaluate((color) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 4;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 4, 4);
        return canvas.toDataURL().split(",")[1];
      }, color),
      "base64",
    );
  const sourcePicker = page.waitForEvent("filechooser");
  await page.getByLabel("Load custom source texture").click();
  await (
    await sourcePicker
  ).setFiles({
    name: "source.png",
    mimeType: "image/png",
    buffer: await png("rgba(200, 0, 0, 0.5)"),
  });
  await expect(page.locator("#source-name")).toHaveText("source.png");
  const destinationPicker = page.waitForEvent("filechooser");
  await page.getByLabel("Load custom destination texture").click();
  await (
    await destinationPicker
  ).setFiles({
    name: "destination.png",
    mimeType: "image/png",
    buffer: await png("rgb(0, 100, 0)"),
  });
  await expect(page.locator("#destination-name")).toHaveText("destination.png");
  const pixel = () =>
    page.evaluate(() => {
      document.getElementById("opacity").dispatchEvent(new Event("input"));
      const canvas = document.querySelector("#result canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      const p = new Uint8Array(4);
      gl.readPixels(
        Math.floor(canvas.width / 2),
        Math.floor(canvas.height / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        p,
      );
      return [...p];
    });
  const close = (actual, expected) =>
    expected.forEach((v, i) =>
      expect(Math.abs(actual[i] - v)).toBeLessThanOrEqual(2),
    );
  close(await pixel(), [100, 50, 0, 255]);
  await page.selectOption("#preset", "additive");
  close(await pixel(), [100, 100, 0, 255]);
  await page.selectOption("#preset", "multiply");
  close(await pixel(), [0, 0, 0, 128]);
  await page.selectOption("#preset", "replace");
  close(await pixel(), [200, 0, 0, 128]);
  await page.selectOption("#preset", "normal");
  await page.locator("#opacity").fill("0");
  close(await pixel(), [0, 100, 0, 255]);
  await page.locator("#opacity").fill("100");
  await page.selectOption("#equation", "MaxEquation");
  close(await pixel(), [200, 100, 0, 255]);
  await page.selectOption("#equation", "AddEquation");
  await page.selectOption("#source-factor", "DstAlphaFactor");
  await page.selectOption("#destination-factor", "ZeroFactor");
  await page.locator("#destination-file").setInputFiles({
    name: "transparent-destination.png",
    mimeType: "image/png",
    buffer: await png("rgba(0, 100, 0, 0.25)"),
  });
  await expect(page.locator("#destination-name")).toHaveText(
    "transparent-destination.png",
  );
  close(await pixel(), [50, 0, 0, 32]);
  await page.locator("#background").fill("#123456");
  await expect(page.locator("#result")).toHaveCSS(
    "background-color",
    "rgb(18, 52, 86)",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.click("#download");
  expect((await downloadPromise).suggestedFilename()).toBe("blend-custom.png");
  await page.locator("#source-file").setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.locator("#message")).toContainText("Could not read");
  await expect(page.locator("#source-name")).toHaveText("source.png");
});

test("code exploration survives a missing renderer", async ({ page }) => {
  await page.route("**/vendor/three.min.js", (route) => route.abort());
  await page.reload();
  await expect(page.locator("#render-status")).toContainText(
    "Preview unavailable",
  );
  await page.selectOption("#preset", "additive");
  await expect(page.locator("#code")).toContainText("GL_SRC_ALPHA, GL_ONE");
  await expect(page.locator("#download")).toBeDisabled();
});

test("language output follows blend settings and copies the selected snippet", async ({
  page,
}) => {
  const code = page.locator("#code");
  for (const [language, enable, alpha, disable] of [
    [
      "cpp",
      "glEnable(GL_BLEND);",
      "GL_ONE, GL_ONE_MINUS_SRC_ALPHA",
      "glDisable(GL_BLEND);",
    ],
    [
      "rust",
      "gl::Enable(gl::BLEND);",
      "gl::ONE, gl::ONE_MINUS_SRC_ALPHA",
      "gl::Disable(gl::BLEND);",
    ],
    [
      "python",
      "GL.glEnable(GL.GL_BLEND)",
      "GL.GL_ONE, GL.GL_ONE_MINUS_SRC_ALPHA",
      "GL.glDisable(GL.GL_BLEND)",
    ],
  ]) {
    await page.selectOption("#preset", "normal");
    await page.selectOption("#code-language", language);
    await expect(code).toContainText(enable);
    await expect(code).toContainText(alpha);
    if (language === "rust") await expect(code).toContainText("unsafe {");
    if (language === "python")
      await expect(code).toContainText("from OpenGL import GL");
    await page.locator("#opacity").fill("37");
    await expect(code).toContainText("color.a *= 0.37;");
    await page.selectOption("#equation", "ReverseSubtractEquation");
    await expect(code).toContainText(
      language === "rust"
        ? "gl::FUNC_REVERSE_SUBTRACT"
        : "GL_FUNC_REVERSE_SUBTRACT",
    );
    await page.selectOption("#source-factor", "DstAlphaFactor");
    await expect(code).toContainText(
      language === "rust" ? "gl::DST_ALPHA" : "GL_DST_ALPHA",
    );
    await page.selectOption("#equation", "MinEquation");
    await expect(code).toContainText(
      language === "rust" ? "gl::MIN" : "GL_MIN",
    );
    await page.selectOption("#preset", "replace");
    await expect(code).toContainText(disable);
    await expect(code).not.toContainText("BlendFuncSeparate");
  }
  await page.selectOption("#preset", "additive");
  await page.selectOption("#code-language", "rust");
  await expect(page.locator("#source-factor")).toHaveValue("SrcAlphaFactor");
  await expect(page.locator("#destination-factor")).toHaveValue("OneFactor");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.copiedSnippet = text;
        },
      },
    });
  });
  await page.click("#copy");
  expect(await page.evaluate(() => window.copiedSnippet)).toBe(
    await code.textContent(),
  );
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
