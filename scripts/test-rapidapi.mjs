/**
 * scripts/test-rapidapi.mjs
 *
 * Quick smoke-test for the RapidAPI / Cricbuzz key.
 * Run: node scripts/test-rapidapi.mjs
 *
 * Reads RAPIDAPI_KEY (and RAPIDAPI_KEY_2 if set) from .env.local,
 * hits three lightweight Cricbuzz endpoints, and reports pass/fail + quota info.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env.local manually (no dotenv dependency needed) ────────────────────
function loadEnv(filePath) {
  try {
    const lines = readFileSync(filePath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {
    console.warn("⚠  .env.local not found — using process.env as-is");
  }
}

loadEnv(resolve(process.cwd(), ".env.local"));

// ── Collect keys ──────────────────────────────────────────────────────────────
const HOST = process.env.RAPIDAPI_CRICBUZZ_HOST ?? "cricbuzz-cricket.p.rapidapi.com";
const BASE = `https://${HOST}`;

const keys = [
  process.env.RAPIDAPI_KEY,
  process.env.RAPIDAPI_KEY_2,
].filter(Boolean);

if (keys.length === 0) {
  console.error("✗ No RAPIDAPI_KEY found in .env.local");
  process.exit(1);
}

console.log(`\nRapidAPI smoke-test`);
console.log(`Host : ${HOST}`);
console.log(`Keys : ${keys.length} configured\n`);

// ── Test endpoints ────────────────────────────────────────────────────────────
const TESTS = [
  {
    label: "Series list (league)",
    path: "/series/v1/league",
    check: (data) => Array.isArray(data?.seriesMapProto) || typeof data === "object",
  },
  {
    label: "Recent matches",
    path: "/matches/v1/recent",
    check: (data) => Array.isArray(data?.typeMatches) || typeof data === "object",
  },
];

async function testKey(key, keyLabel) {
  console.log(`── Key: ${keyLabel} (…${key.slice(-6)}) ──`);

  for (const test of TESTS) {
    const url = `${BASE}${test.path}`;
    const start = Date.now();

    try {
      const res = await fetch(url, {
        headers: {
          "X-RapidAPI-Key": key,
          "X-RapidAPI-Host": HOST,
          "User-Agent": "IPL-Auction-Test/1.0",
        },
        signal: AbortSignal.timeout(15_000),
      });

      const elapsed = Date.now() - start;
      const remaining = res.headers.get("X-RateLimit-Requests-Remaining");
      const limit     = res.headers.get("X-RateLimit-Requests-Limit");
      const reset     = res.headers.get("X-RateLimit-Requests-Reset");

      const quotaInfo = remaining != null
        ? `  quota: ${remaining}/${limit ?? "?"} remaining${reset ? `, resets ${reset}` : ""}`
        : "";

      if (res.status === 429 || res.status === 402) {
        console.log(`  ✗ RATE LIMITED  ${test.label}  (HTTP ${res.status}, ${elapsed}ms)${quotaInfo}`);
        const body = await res.text().catch(() => "");
        if (body) console.log(`    → ${body.slice(0, 200)}`);
        continue;
      }

      if (!res.ok) {
        console.log(`  ✗ HTTP ${res.status}       ${test.label}  (${elapsed}ms)`);
        const body = await res.text().catch(() => "");
        if (body) console.log(`    → ${body.slice(0, 200)}`);
        continue;
      }

      const data = await res.json().catch(() => null);
      const valid = test.check(data);

      if (valid) {
        const preview = data?.seriesMapProto?.length ?? data?.typeMatches?.length ?? "✓";
        console.log(`  ✓ OK (${elapsed}ms)        ${test.label}  [items: ${preview}]${quotaInfo}`);
      } else {
        console.log(`  ⚠ Unexpected shape (${elapsed}ms)  ${test.label}${quotaInfo}`);
        console.log(`    → ${JSON.stringify(data).slice(0, 200)}`);
      }
    } catch (err) {
      const elapsed = Date.now() - start;
      console.log(`  ✗ NETWORK ERROR (${elapsed}ms)  ${test.label}`);
      console.log(`    → ${err.message}`);
    }
  }

  console.log();
}

// ── Run for every key ─────────────────────────────────────────────────────────
for (let i = 0; i < keys.length; i++) {
  await testKey(keys[i], `RAPIDAPI_KEY${i === 0 ? "" : `_${i + 1}`}`);
}

console.log("Done.");
