import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import path from "node:path";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import electronPath from "electron";

let electronProc: ChildProcess | null = null;

function killElectronQuiet(): void {
  if (!electronProc?.pid) {
    electronProc = null;
    return;
  }
  const pid = electronProc.pid;
  electronProc.removeAllListeners();
  try {
    if (process.platform === "win32") {
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
      } catch {
        // PID already gone
      }
    } else {
      try {
        electronProc.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  } finally {
    electronProc = null;
  }
}

function startElectron(): void {
  killElectronQuiet();

  const env = {
    ...process.env,
    // Ensure renderer URL is always available to the main process
    VITE_DEV_SERVER_URL:
      process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173/",
  };

  console.log(
    "[vite] launching electron with VITE_DEV_SERVER_URL=",
    env.VITE_DEV_SERVER_URL,
  );

  electronProc = spawn(String(electronPath), [".", "--no-sandbox"], {
    stdio: "inherit",
    env,
  });

  electronProc.on("exit", (code) => {
    electronProc = null;
    if (code !== 0 && code !== null) {
      console.log(`[electron] exited with code ${code}`);
    } else {
      console.log(
        "[electron] window closed — Vite still running. Save a main/preload file to relaunch.",
      );
    }
  });
}

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        onstart() {
          startElectron();
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
              output: {
                // Force CJS .cjs so Electron can require() the preload reliably
                format: "cjs",
                entryFileNames: "preload.cjs",
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
});
