import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  Crumbs,
  EmptyState,
  SectionHeading,
  SeverityBadge,
  Stat,
} from "@/components/ui";
import { DependencyBrowser } from "@/components/dependency-browser";
import { WhyPanel } from "@/components/why-panel";
import { compactNumber, fullNumber, maintainerHref, packageHref } from "@/lib/format";
import {
  getApplication,
  getApplicationPackages,
  getLicenseExposure,
  getMaintainerExposure,
  getReachableAdvisories,
  getSoloMaintainedPackages,
} from "@/lib/queries/applications";

export const runtime = "nodejs";
export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/apps/[slug]">) {
  const { slug } = await params;
  const app = await getApplication(slug);
  return {
    title: app ? app.name + " — Blast Radius" : "Application — Blast Radius",
  };
}

export default async function ApplicationPage({ params }: PageProps<"/apps/[slug]">) {
  const { slug } = await params;

  const app = await getApplication(slug);
  if (!app) notFound();

  // Four independent traversals; running them concurrently means the page waits
  // for the slowest rather than the sum.
  const [maintainers, solo, advisories, licenses, packages] = await Promise.all([
    getMaintainerExposure(slug),
    getSoloMaintainedPackages(slug),
    getReachableAdvisories(slug),
    getLicenseExposure(slug),
    getApplicationPackages(slug),
  ]);

  return (
    <div>
      <Crumbs items={[{ label: "Applications", href: "/" }, { label: app.name }]} />

      <header className="mb-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[26px] font-semibold tracking-tight text-text">{app.name}</h1>
          <span className="text-[13px] text-text-subtle">{app.category}</span>
        </div>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-text-muted">
          {app.description}
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          <a
            href={app.repoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent hover:underline"
          >
            Repository
          </a>
          <span className="font-mono text-text-subtle">{app.npmPackage}</span>
        </p>
      </header>

      <Card className="mb-6 px-6 py-5">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Declared" value={fullNumber(app.directDepCount)} hint="direct deps" />
          <Stat
            label="Installed"
            value={fullNumber(app.transitivePackageCount)}
            hint="unique packages"
          />
          <Stat label="Deepest" value={app.maxDepth + " hops"} />
          <Stat
            label="Maintainers"
            value={fullNumber(app.maintainerCount)}
            hint="can publish here"
          />
          <Stat
            label="Solo-owned"
            value={fullNumber(app.soloMaintainedCount)}
            hint="one person each"
            tone="warn"
          />
          <Stat
            label="Advisories"
            value={fullNumber(app.advisoryCount)}
            hint={app.criticalAdvisoryCount + " critical"}
            tone={app.criticalAdvisoryCount > 0 ? "critical" : "default"}
          />
        </dl>
      </Card>

      <p className="mb-10 rounded-lg border border-border-subtle bg-accent-soft/50 px-4 py-3 text-[13px] leading-relaxed text-text">
        {app.name} declares <strong>{app.directDepCount}</strong> dependencies. Installing it
        actually delivers <strong>{fullNumber(app.transitivePackageCount)}</strong> packages,
        written and published by <strong>{fullNumber(app.maintainerCount)}</strong> different
        people.
      </p>

      {/* Q2 — the headline query */}
      <section className="mb-12">
        <SectionHeading
          title="Who can publish into this application"
          description="Every person with publish rights to a package in this dependency tree, ranked by how many of them they control. A compromised account reaches everything on its row."
        />
        {maintainers.length === 0 ? (
          <EmptyState
            title="No maintainers found"
            body="This application's dependency tree has no maintainer records in the graph."
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-text-subtle">
                  <th className="px-4 py-2.5 font-medium">Maintainer</th>
                  <th className="px-4 py-2.5 font-medium">Packages here</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Examples</th>
                </tr>
              </thead>
              <tbody>
                {maintainers.map((person) => (
                  <tr
                    key={person.username}
                    className="border-b border-border-subtle last:border-0"
                  >
                    <td className="px-4 py-2.5 align-top">
                      <Link
                        href={maintainerHref(person.username)}
                        className="font-mono text-[13px] text-accent hover:underline"
                      >
                        {person.username}
                      </Link>
                      <p className="text-[11px] text-text-subtle">
                        {person.packagesTotal} across the graph
                      </p>
                    </td>
                    <td className="tnum px-4 py-2.5 align-top text-[15px] font-semibold text-text">
                      {person.packagesInTree}
                    </td>
                    <td className="hidden px-4 py-2.5 align-top sm:table-cell">
                      <span className="font-mono text-[12px] text-text-muted">
                        {person.samplePackages.slice(0, 3).join(", ")}
                        {person.packagesInTree > 3 ? " …" : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* What it actually installs — the entry point for "why is this here?" */}
      <section className="mb-12">
        <SectionHeading
          title="What this application installs"
          description="Every package delivered by installing it, not just the ones it asked for. Search the whole tree, then open any row to see the chain that pulls it in."
        />
        <DependencyBrowser
          appSlug={slug}
          initialPackages={packages}
          totalPackages={app.transitivePackageCount}
        />
      </section>

      {/* Q4 */}
      <section className="mb-12">
        <SectionHeading
          title="Known vulnerabilities reachable from here"
          description="Advisories affecting a package somewhere in this tree, with how many hops away it sits. Open any row to see the chain that pulls it in."
        />
        {advisories.length === 0 ? (
          <EmptyState
            title="No known advisories"
            body="No package in this dependency tree currently has a published advisory in the OSV database."
          />
        ) : (
          <ul className="space-y-2">
            {advisories.map((advisory) => (
              <li key={advisory.ghsaId + advisory.versionId}>
                <Card className="px-4 py-3">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    <SeverityBadge severity={advisory.severity} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-relaxed text-text">{advisory.summary}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-text-muted">
                        <Link
                          href={packageHref(advisory.packageName)}
                          className="font-mono text-accent hover:underline"
                        >
                          {advisory.versionId}
                        </Link>
                        <span>
                          {advisory.hops} {advisory.hops === 1 ? "hop" : "hops"} away
                        </span>
                        <a
                          href={advisory.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="hover:text-accent"
                        >
                          {advisory.ghsaId}
                        </a>
                      </p>
                      <div className="mt-1.5">
                        <WhyPanel appSlug={slug} packageName={advisory.packageName} />
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Q3 */}
      <section className="mb-12">
        <SectionHeading
          title="Single points of failure"
          description="Packages in this tree that exactly one person can publish, ranked by how much of the graph depends on them."
        />
        {solo.length === 0 ? (
          <EmptyState
            title="No single-maintainer packages"
            body="Every package in this tree has at least two people with publish rights."
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-text-subtle">
                  <th className="px-4 py-2.5 font-medium">Package</th>
                  <th className="px-4 py-2.5 font-medium">Sole maintainer</th>
                  <th className="px-4 py-2.5 font-medium">Depended on by</th>
                  <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Weekly</th>
                </tr>
              </thead>
              <tbody>
                {solo.map((entry) => (
                  <tr key={entry.name} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-2.5 align-top">
                      <Link
                        href={packageHref(entry.name)}
                        className="font-mono text-[13px] text-accent hover:underline"
                      >
                        {entry.name}
                      </Link>
                      <div className="mt-0.5">
                        <WhyPanel appSlug={slug} packageName={entry.name} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      <Link
                        href={maintainerHref(entry.maintainer)}
                        className="font-mono text-[13px] text-text-muted hover:text-accent"
                      >
                        {entry.maintainer}
                      </Link>
                    </td>
                    <td className="tnum px-4 py-2.5 align-top text-[13px] text-text">
                      {entry.dependentCount}
                    </td>
                    <td className="tnum hidden px-4 py-2.5 align-top text-[13px] text-text-muted sm:table-cell">
                      {compactNumber(entry.weeklyDownloads)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* Q6 */}
      <section>
        <SectionHeading
          title="Licence exposure"
          description="Non-permissive licences reachable through this tree. Copyleft terms can impose obligations on code that links to them, and bespoke licences need reading by a human."
        />
        {licenses.length === 0 ? (
          <EmptyState
            title="Everything is permissively licensed"
            body="Every package reachable within 5 hops carries a permissive licence such as MIT, ISC or Apache-2.0."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {licenses.map((license) => (
              <Card key={license.spdxId} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[13px] font-medium text-text">
                    {license.spdxId}
                  </span>
                  <span className="tnum text-[13px] text-text-muted">
                    {license.versionCount} {license.versionCount === 1 ? "package" : "packages"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-text-subtle">
                  {license.category.replace("-", " ")}
                </p>
                <p className="mt-2 font-mono text-[12px] leading-relaxed text-text-muted">
                  {license.samplePackages.join(", ")}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <Card className="px-5 py-4">
          <p className="text-[13px] text-text-muted">
            Compare this application&rsquo;s exposure against another —{" "}
            <Link href={"/compare?a=" + slug} className="text-accent hover:underline">
              see what they share
            </Link>
            .
          </p>
        </Card>
      </section>
    </div>
  );
}
