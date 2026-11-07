const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests",
  use: {
    channel: process.env.CI ? "chromium" : "chrome",
    headless: true,
    viewport: { width: 1440, height: 1100 },
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "python -m http.server 8937 --bind 127.0.0.1",
    url: "http://127.0.0.1:8937",
    reuseExistingServer: !process.env.CI,
  },
});
