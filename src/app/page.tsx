import Link from "next/link";

import { Card, Stat } from "@/components/ui";
import { compactNumber, fullNumber } from "@/lib/format";
import { listApplications } from "@/lib/queries/applications";
import { getGraphStats } from "@/lib/queries/overview";

// Bolt is raw TCP and cannot run on the Edge runtime.
export const runtime = "nodejs";
export const revalidate = 300;

export default async function DashboardPage() {
  const [applications, stats] = await Promise.all([listApplications(), getGraphStats()]);

  return (
    <div>
      <section className="mb-10 max-w-3xl">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-text">
          Who can publish code into the software you run?
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          Installing an application approves a handful of dependencies. It delivers thousands, each
          maintained by someone you never chose. This explores the real dependency graph of six
          self-hostable applications — every package that reaches production, and every person who
          can publish to it.
        </p>
      </section>

      {stats ? (
        <Card className="mb-10 px-6 py-5">
          <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Packages" value={fullNumber(stats.packages)} />
            <Stat label="Versions" value={fullNumber(stats.versions)} />
            <Stat
              label="Maintainers"
              value={fullNumber(stats.maintainers)}
              hint="people with publish rights"
            />
            <Stat
              label="Single-maintainer"
              value={fullNumber(stats.soloMaintainedPackages)}
              hint={
                Math.round((stats.soloMaintainedPackages / stats.packages) * 100) +
                "% rest on one person"
              }
              tone="warn"
            />
            <Stat label="Relationships" value={fullNumber(stats.relationships)} />
          </dl>
        </Card>
      ) : null}

      <h2 className="mb-1 text-[15px] font-semibold tracking-tight text-text">Applications</h2>
      <p className="mb-4 text-[13px] text-text-muted">
        Each card compares what the application declares against what it actually pulls in.
      </p>

      <ul className="grid gap-4 sm:grid-cols-2">
        {applications.map((app) => (
          <li key={app.slug}>
            <Link
              href={"/apps/" + app.slug}
              className="group block h-full rounded-xl border border-border-subtle bg-surface p-5 transition-colors hover:border-accent/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold tracking-tight text-text transition-colors group-hover:text-accent">
                    {app.name}
                  </h3>
                  <p className="mt-0.5 text-[12px] text-text-subtle">{app.category}</p>
                </div>
                {app.criticalAdvisoryCount > 0 ? (
                  <span className="shrink-0 rounded-md bg-critical-soft px-2 py-0.5 text-[11px] font-semibold text-critical">
                    {app.criticalAdvisoryCount} critical
                  </span>
                ) : null}
              </div>

              <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-text-muted">
                {app.description}
              </p>

              <p className="tnum mt-4 text-[13px] text-text-muted">
                <span className="font-semibold text-text">{app.directDepCount}</span> declared
                <span aria-hidden className="mx-1.5 text-text-subtle">
                  →
                </span>
                <span className="font-semibold text-text">
                  {fullNumber(app.transitivePackageCount)}
                </span>{" "}
                actually installed
              </p>

              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border-subtle pt-3">
                <div>
                  <dt className="text-[11px] text-text-subtle">Maintainers</dt>
                  <dd className="tnum text-[15px] font-semibold text-text">
                    {compactNumber(app.maintainerCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-text-subtle">Solo-owned</dt>
                  <dd className="tnum text-[15px] font-semibold text-high">
                    {compactNumber(app.soloMaintainedCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-text-subtle">Advisories</dt>
                  <dd className="tnum text-[15px] font-semibold text-text">
                    {app.advisoryCount}
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
