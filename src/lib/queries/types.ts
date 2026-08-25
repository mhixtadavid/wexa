/**
 * Result shapes returned by the query layer.
 *
 * These are plain serialisable objects, never driver records, so a React
 * Server Component can hand them straight to a client component without a
 * conversion step. The driver is configured with `disableLosslessIntegers`,
 * so counts arrive as ordinary JS numbers.
 */

export type Severity = "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | "UNKNOWN";
export type LicenseCategory =
  | "permissive"
  | "weak-copyleft"
  | "copyleft"
  | "custom"
  | "unknown";

export interface ApplicationSummary {
  slug: string;
  name: string;
  description: string;
  category: string;
  repoUrl: string;
  npmPackage: string;
  directDepCount: number;
  transitivePackageCount: number;
  transitiveVersionCount: number;
  maintainerCount: number;
  soloMaintainedCount: number;
  advisoryCount: number;
  criticalAdvisoryCount: number;
  nonPermissiveCount: number;
  deprecatedCount: number;
  maxDepth: number;
}

export interface MaintainerExposure {
  username: string;
  email: string | null;
  /** Packages inside this application's tree that this person can publish. */
  packagesInTree: number;
  /** Packages they maintain across the entire graph. */
  packagesTotal: number;
  samplePackages: string[];
}

export interface SoloMaintainedPackage {
  name: string;
  maintainer: string;
  weeklyDownloads: number | null;
  /** How many other versions in the graph require this package. */
  dependentCount: number;
  minDepth: number;
}

export interface ReachableAdvisory {
  ghsaId: string;
  summary: string;
  severity: Severity;
  cvss: number | null;
  url: string;
  packageName: string;
  versionId: string;
  hops: number;
  /** The chain from the application to the vulnerable version. */
  chain: string[];
}

export interface DependencyPath {
  hops: number;
  chain: string[];
}

export interface BlastRadiusEntry {
  slug: string;
  name: string;
  hops: number;
  chain: string[];
}

export interface BlastRadius {
  packageName: string;
  description: string | null;
  weeklyDownloads: number | null;
  repoUrl: string | null;
  maintainers: string[];
  versions: string[];
  affected: BlastRadiusEntry[];
}

export interface ApplicationPackage {
  name: string;
  /** Shortest distance from the application, in hops. */
  hops: number;
  maintainerCount: number;
  weeklyDownloads: number | null;
}

export interface LicenseExposure {
  spdxId: string;
  category: LicenseCategory;
  versionCount: number;
  samplePackages: string[];
}

export interface PackageSummary {
  name: string;
  description: string | null;
  weeklyDownloads: number | null;
  repoUrl: string | null;
  maintainerCount: number;
  versionCount: number;
  dependentCount: number;
}

export interface MaintainerDetail {
  username: string;
  email: string | null;
  packageCount: number;
  packages: Array<{ name: string; weeklyDownloads: number | null; soloMaintained: boolean }>;
  applications: Array<{ slug: string; name: string; packagesReached: number }>;
}

export interface SharedExposureEntry {
  packageName: string;
  weeklyDownloads: number | null;
  maintainerCount: number;
  hopsA: number;
  hopsB: number;
}

export interface SearchResult {
  kind: "application" | "package" | "maintainer";
  id: string;
  label: string;
  detail: string | null;
}

export interface GraphStats {
  applications: number;
  packages: number;
  versions: number;
  maintainers: number;
  advisories: number;
  relationships: number;
  soloMaintainedPackages: number;
}
