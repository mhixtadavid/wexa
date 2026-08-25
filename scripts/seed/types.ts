import type { Advisory, AffectsEdge } from "./advisories";
import type { ApplicationRollup, ExposedToEdge } from "./rollups";

export interface PackageNode {
  name: string;
  ecosystem: "npm";
  description: string | null;
  weeklyDownloads: number | null;
  repoUrl: string | null;
}

export interface VersionNode {
  id: string;
  packageName: string;
  number: string;
  depth: number;
  deprecated: boolean;
}

export interface MaintainerNode {
  username: string;
  email: string | null;
}

export interface LicenseNode {
  spdxId: string;
  category: "permissive" | "weak-copyleft" | "copyleft" | "custom" | "unknown";
}

export interface ApplicationNode {
  slug: string;
  name: string;
  description: string;
  repoUrl: string;
  category: string;
  npmPackage: string;
}

export interface Snapshot {
  generatedAt: string;
  applications: ApplicationNode[];
  rollups: ApplicationRollup[];
  packages: PackageNode[];
  versions: VersionNode[];
  maintainers: MaintainerNode[];
  licenses: LicenseNode[];
  advisories: Advisory[];
  edges: {
    dependsOn: Array<{ appSlug: string; toId: string; range: string }>;
    hasVersion: Array<{ packageName: string; versionId: string }>;
    requires: Array<{ fromId: string; toId: string; range: string }>;
    maintains: Array<{ username: string; packageName: string }>;
    licensedUnder: Array<{ versionId: string; spdxId: string }>;
    affects: AffectsEdge[];
    exposedTo: ExposedToEdge[];
  };
}
