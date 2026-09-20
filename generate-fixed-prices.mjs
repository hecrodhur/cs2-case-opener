#!/usr/bin/env node
/**
 * Generate a static CS2 price snapshot for cs2-case-opener.
 *
 * Sources:
 *  1) OpenSkin v1/prices/all -> Steam ask/median (free, no API key)
 *  2) 49Skins public full snapshot -> EUR live marketplace fallback
 *  3) SkinCash full snapshot -> USD fallback
 *
 * The generated JSON contains only:
 *  - all active Case crates from ByMykel/CSGO-API
 *  - every weapon/knife/glove variant represented by skins.json:
 *      valid wears x StatTrak x Souvenir
 *
 * Output:
 *   server/src/data/fixedPrices.json
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.resolve(ROOT, "server/src/data/fixedPrices.json");

const CSGO_BASE =
  process.env.CSGO_API_BASE ??
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en";

const OPEN_SKIN_URL = "https://api.openskin.dev/v1/prices/all";
const NINETY_NINESKINS_URL = "https://api.49skins.com/api/public/prices?game=cs2";
const SKINCASH_URL = "https://api.skincash.gg/v1/prices";

const WEARS = [
  "Factory New",
  "Minimal Wear",
  "Field-Tested",
  "Well-Worn",
  "Battle-Scarred",
];

function variantName(base, { wear, stattrak = false, souvenir = false, glove = false } = {}) {
  let n = base;

  // Steam order for knives: ★ StatTrak™ Knife | ...
  if (stattrak) {
    n = n.startsWith("★ ")
      ? "★ StatTrak™ " + n.slice(2)
      : "StatTrak™ " + n;
  }

  if (souvenir) n = "Souvenir " + n;

  if (wear && wear !== "any" && !glove) {
    n = `${n} (${wear})`;
  }

  return n;
}

async function getJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "cs2-case-opener-fixed-price-builder/1.0",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    throw new Error(`${url} -> HTTP ${res.status}`);
  }

  return await res.json();
}

// Non-fatal fetch: on any error (network down, wrong shape) return the fallback
// so a partial snapshot run never crashes and never invents a price.
async function safeGetJson(url, fallback) {
  try {
    return await getJson(url);
  } catch (err) {
    console.warn(`  ! source unavailable, continuing without it: ${url} (${err?.message ?? err})`);
    return fallback;
  }
}

function csvLikeUsdToEurCents(usd, eurUsd) {
  // Caller supplies EUR-per-USD.
  if (!Number.isFinite(usd) || usd <= 0 || !Number.isFinite(eurUsd) || eurUsd <= 0) {
    return null;
  }
  return Math.max(1, Math.round(usd * eurUsd * 100));
}

async function getUsdEurRate() {
  // Frankfurter is public and uses ECB reference rates.
  try {
    const x = await getJson("https://api.frankfurter.app/latest?from=USD&to=EUR");
    const rate = Number(x?.rates?.EUR);
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch {}
  // Safe-ish last resort; only used for converting SkinCash fallback.
  return 0.85;
}

function desiredCatalog(skins, crates) {
  const names = new Set();
  const meta = new Map();

  for (const c of crates) {
    if (c?.type === "Case" && Array.isArray(c?.contains) && c.contains.length) {
      const mhn = c.market_hash_name ?? c.name;
      names.add(mhn);
      meta.set(mhn, { kind: "case", name: c.name });
    }
  }

  for (const s of skins) {
    const base = String(s?.name ?? "").trim();
    if (!base) continue;

    const category = String(s?.category ?? "");
    const glove = category === "Gloves";
    const wears = glove
      ? ["any"]
      : (Array.isArray(s?.wears) && s.wears.length
          ? s.wears.filter((x) => WEARS.includes(x))
          : WEARS);

    const stattrak = Boolean(s?.stattrak);
    const souvenir = Boolean(s?.souvenir);

    for (const wear of wears) {
      const normal = variantName(base, { wear, glove });
      names.add(normal);
      meta.set(normal, {
        kind: glove ? "glove" : category === "Knives" ? "knife" : "skin",
        base,
        wear,
        stattrak: false,
        souvenir: false,
      });

      if (stattrak) {
        const st = variantName(base, { wear, stattrak: true, glove });
        names.add(st);
        meta.set(st, {
          kind: glove ? "glove" : category === "Knives" ? "knife" : "skin",
          base,
          wear,
          stattrak: true,
          souvenir: false,
        });
      }

      if (souvenir) {
        const sv = variantName(base, { wear, souvenir: true, glove });
        names.add(sv);
        meta.set(sv, {
          kind: glove ? "glove" : category === "Knives" ? "knife" : "skin",
          base,
          wear,
          stattrak: false,
          souvenir: true,
        });
      }
    }
  }

  return { names: [...names], meta };
}

function openSkinPrice(row) {
  const steam = row?.steam;
  if (!steam) return null;

  const ask = Number(steam.ask);
  if (Number.isFinite(ask) && ask > 0) {
    return {
      priceCents: Math.round(ask * 100 * 1), // USD -> converted later
      kind: "steam_ask",
      updatedAt: steam.updated_at ?? row?.updated_at ?? null,
      volume: Number(steam.sell_order_count ?? steam.volume_24h ?? 0) || 0,
      usd: true,
    };
  }

  const median = Number(steam.median);
  if (Number.isFinite(median) && median > 0) {
    return {
      priceCents: Math.round(median * 100),
      kind: "steam_median",
      updatedAt: steam.updated_at ?? row?.updated_at ?? null,
      volume: Number(steam.volume_24h ?? 0) || 0,
      usd: true,
    };
  }

  return null;
}

async function main() {
  console.log("Fetching CSGO-API catalog...");
  const [skins, crates] = await Promise.all([
    getJson(`${CSGO_BASE}/skins.json`),
    getJson(`${CSGO_BASE}/crates.json`),
  ]);

  if (!Array.isArray(skins) || !Array.isArray(crates)) {
    throw new Error("CSGO-API returned an unexpected shape");
  }

  const wanted = desiredCatalog(skins, crates);
  console.log(`Catalog targets: ${wanted.names.length} variants/cases`);

  // Carry forward last known prices so a degraded re-run never loses data and
  // never invents a price: if a source is down for an item, keep the previous
  // snapshot's value.
  let prev = {};
  try {
    const prevDoc = JSON.parse(await fs.readFile(OUT, "utf8"));
    if (prevDoc && typeof prevDoc.items === "object" && prevDoc.items) prev = prevDoc.items;
  } catch {}

  console.log("Fetching OpenSkin full price snapshot...");
  const openSkin = await safeGetJson(OPEN_SKIN_URL, null);
  const openData = openSkin?.data ?? {};
  console.log(`OpenSkin timestamp: ${openSkin?.updated_at ?? "unavailable"}`);

  console.log("Fetching 49Skins live snapshot...");
  const skins49 = await safeGetJson(NINETY_NINESKINS_URL, []);
  if (!Array.isArray(skins49)) throw new Error("49Skins returned an unexpected shape");
  const fallback49 = new Map(skins49.map((r) => [r.market_hash_name, r]));

  console.log("Fetching SkinCash fallback snapshot...");
  const skinCash = await safeGetJson(SKINCASH_URL, {});
  const cashRows = Array.isArray(skinCash?.items) ? skinCash.items : [];
  const fallbackCash = new Map(cashRows.map((r) => [r.market_hash_name, r]));
  const usdEur = await getUsdEurRate();

  const out = {};
  const counters = {
    targets: wanted.names.length,
    steamAsk: 0,
    steamMedian: 0,
    market49: 0,
    skinCash: 0,
    carried: 0,
    missing: 0,
  };

  for (const name of wanted.names) {
    const meta = wanted.meta.get(name) ?? {};

    let priceCents = null;
    let source = null;
    let stock = 0;
    let updatedAt = null;

    // OpenSkin Steam data is the primary source.
    const os = openData[name];
    const osp = openSkinPrice(os);
    if (osp) {
      if (osp.kind === "steam_ask") counters.steamAsk++;
      else counters.steamMedian++;

      const usd = osp.priceCents / 100;
      priceCents = Math.round(usd * usdEur * 100);
      source = osp.kind;
      stock = osp.volume;
      updatedAt = osp.updatedAt;
    }

    // Current live EUR fallback marketplace.
    if (priceCents == null) {
      const f49 = fallback49.get(name);
      const cents = Number(f49?.min_price);
      if (Number.isFinite(cents) && cents > 0) {
        priceCents = Math.round(cents);
        source = "49skins";
        stock = Number(f49?.quantity ?? 0) || 0;
        updatedAt = new Date().toISOString();
        counters.market49++;
      }
    }

    // Second fallback.
    if (priceCents == null) {
      const fc = fallbackCash.get(name);
      const usd = Number(fc?.price);
      const cents = csvLikeUsdToEurCents(usd, usdEur);
      if (cents != null) {
        priceCents = cents;
        source = "skincash";
        stock = Number(fc?.quantity ?? 0) || 0;
        updatedAt = skinCash?.updated_at ?? new Date().toISOString();
        counters.skinCash++;
      }
    }

    if (priceCents == null) {
      const p = prev[name];
      if (p && Number(p.price_cents) > 0) {
        priceCents = Number(p.price_cents);
        if (!source) source = p.source ?? "carried";
        if (!updatedAt) updatedAt = p.updated_at ?? null;
        if (!stock) stock = Number(p.stock ?? 0) || 0;
        counters.carried++;
      } else {
        counters.missing++;
      }
    }

    out[name] = {
      price_cents: priceCents,
      source,
      stock,
      updated_at: updatedAt,
      ...meta,
    };
  }

  // Helpful top-level metadata. Consumers can use `items`.
  const document = {
    generated_at: new Date().toISOString(),
    currency: "EUR",
    source_priority: [
      "openskin:steam_ask",
      "openskin:steam_median",
      "49skins:min_price",
      "skincash:price",
    ],
    items: out,
    stats: counters,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(document), "utf8");

  console.log(`Wrote ${OUT}`);
  console.log(JSON.stringify(counters, null, 2));
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
