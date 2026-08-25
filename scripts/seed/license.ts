import type { LicenseNode } from "./types";

type Category = LicenseNode["category"];

/** Ordered least to most restrictive; used to resolve compound expressions. */
const RANK: Record<Category, number> = {
  permissive: 0,
  "weak-copyleft": 1,
  copyleft: 2,
  custom: 3,
  unknown: 4,
};

/**
 * Classifies a single SPDX identifier.
 *
 * The distinction that matters operationally is whether linking the code
 * obliges you to publish your own source: copyleft does, weak-copyleft does so
 * only for the library itself, permissive does not. "custom" is separated out
 * because a bespoke licence is not unknown — it is known to need a lawyer.
 */
function classifyAtom(raw: string): Category {
  const id = raw.trim().toUpperCase();
  if (id.length === 0) return "unknown";

  if (id.startsWith("SEE LICENSE IN") || id.startsWith("LICENSEREF") || id === "UNLICENSED") {
    return "custom";
  }
  if (/^(AGPL|GPL|SSPL|OSL|EUPL|CECILL)/.test(id)) return "copyleft";
  if (/^(LGPL|MPL|EPL|CDDL|CPL|MS-RL)/.test(id)) return "weak-copyleft";
  if (
    /^(MIT|ISC|APACHE|BSD|UNLICENSE|0BSD|CC0|CC-BY|WTFPL|BLUEOAK|PYTHON|ZLIB|BSL|AFL|ARTISTIC|POSTGRESQL|NCSA|BEERWARE|JSON|UPL|MS-PL)/.test(
      id,
    )
  ) {
    return "permissive";
  }
  return "unknown";
}

/**
 * npm licence fields are frequently SPDX expressions rather than bare
 * identifiers: "(MIT OR Apache-2.0)", "(AFL-2.1 OR BSD-3-Clause)". Treating
 * those as unrecognised strings put real permissive packages in the
 * unknown bucket and made the contamination query misleading.
 *
 * OR means the licensee chooses, so the least restrictive operand governs.
 * AND means every term applies, so the most restrictive governs.
 */
export function categorise(spdxId: string): Category {
  const cleaned = spdxId.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();

  if (/^see licen[cs]e in/i.test(cleaned) || /^licenseref/i.test(cleaned)) return "custom";

  if (/\sOR\s/i.test(cleaned)) {
    const parts = cleaned.split(/\sOR\s/i).map(classifyAtom);
    return parts.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));
  }

  if (/\sAND\s/i.test(cleaned)) {
    const parts = cleaned.split(/\sAND\s/i).map(classifyAtom);
    return parts.reduce((a, b) => (RANK[a] >= RANK[b] ? a : b));
  }

  return classifyAtom(cleaned);
}

/** The registry reports licences as a string, a legacy object, or not at all. */
export function normaliseLicense(raw: string | { type?: string } | undefined): string | null {
  if (!raw) return null;
  const value = typeof raw === "string" ? raw : raw.type;
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length < 64 ? trimmed : null;
}

export function normaliseRepoUrl(raw: string | { url?: string } | undefined): string | null {
  if (!raw) return null;
  const value = typeof raw === "string" ? raw : raw.url;
  if (!value) return null;
  return value
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "");
}
