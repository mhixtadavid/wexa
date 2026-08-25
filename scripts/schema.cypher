// Schema for the dependency blast-radius graph.
// Run this once, before seeding. Statements are separated by a blank line and
// executed one at a time by scripts/apply-schema.ts.
//
// Uniqueness constraints double as lookup indexes, so every node type that the
// seed script MERGEs on is constrained here. Without them, MERGE degrades to a
// full label scan and the seed takes minutes instead of seconds.

CREATE CONSTRAINT package_name IF NOT EXISTS
FOR (p:Package) REQUIRE p.name IS UNIQUE

CREATE CONSTRAINT version_id IF NOT EXISTS
FOR (v:Version) REQUIRE v.id IS UNIQUE

CREATE CONSTRAINT maintainer_username IF NOT EXISTS
FOR (m:Maintainer) REQUIRE m.username IS UNIQUE

CREATE CONSTRAINT application_slug IF NOT EXISTS
FOR (a:Application) REQUIRE a.slug IS UNIQUE

CREATE CONSTRAINT advisory_id IF NOT EXISTS
FOR (adv:Advisory) REQUIRE adv.ghsaId IS UNIQUE

CREATE CONSTRAINT license_spdx IF NOT EXISTS
FOR (l:License) REQUIRE l.spdxId IS UNIQUE

// Versions are frequently looked up by their package name when rendering a
// package page, and that property is not covered by the id constraint.
CREATE INDEX version_package_name IF NOT EXISTS
FOR (v:Version) ON (v.packageName)

// The bus-factor and blast-radius rankings sort on these.
CREATE INDEX package_downloads IF NOT EXISTS
FOR (p:Package) ON (p.weeklyDownloads)

CREATE INDEX advisory_severity IF NOT EXISTS
FOR (adv:Advisory) ON (adv.severity)
