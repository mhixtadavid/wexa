import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, Crumbs, EmptyState, SectionHeading, Stat } from "@/components/ui";
import { compactNumber, fullNumber, packageHref } from "@/lib/format";
import { getMaintainerDetail } from "@/lib/queries/overview";

export const runtime = "nodejs";
export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/maintainers/[username]">) {
  const { username } = await params;
  return { title: decodeURIComponent(username) + " — Blast Radius" };
}

/**
 * The inverse of the blast-radius view: one npm account, and everything it can
 * reach. This is the screen that makes the argument without needing a caption.
 */
export default async function MaintainerPage({ params }: PageProps<"/maintainers/[username]">) {
  const { username } = await params;
  const person = await getMaintainerDetail(decodeURIComponent(username));
  if (!person) notFound();

  const soloCount = person.packages.filter((entry) => entry.soloMaintained).length;
  const totalReach = person.applications.reduce((sum, app) => sum + app.packagesReached, 0);

  return (
    <div>
      <Crumbs items={[{ label: "Applications", href: "/" }, { label: person.username }]} />

      <header className="mb-8">
        <h1 className="break-all font-mono text-[24px] font-semibold tracking-tight text-text">
          {person.username}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-text-muted">
          An npm account with publish rights to {fullNumber(person.packageCount)}{" "}
          {person.packageCount === 1 ? "package" : "packages"} in this graph.
        </p>
      </header>

      <Card className="mb-8 px-6 py-5">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Packages" value={fullNumber(person.packageCount)} />
          <Stat
            label="Sole maintainer of"
            value={fullNumber(soloCount)}
            hint="no second pair of eyes"
            tone={soloCount > 0 ? "warn" : "default"}
          />
          <Stat
            label="Applications reached"
            value={person.applications.length + " of 6"}
            tone={person.applications.length >= 5 ? "critical" : "default"}
          />
          <Stat label="Package-app links" value={fullNumber(totalReach)} />
        </dl>
      </Card>

      <section className="mb-12">
        <SectionHeading
          title="Applications this account reaches"
          description="A new release from this account lands in each of these builds, through the number of packages shown."
        />
        {person.applications.length === 0 ? (
          <EmptyState
            title="No applications reached"
            body="None of the six seeded applications depend on this person's packages within 5 hops."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {person.applications.map((app) => (
              <li key={app.slug}>
                <Link
                  href={"/apps/" + app.slug}
                  className="flex items-baseline justify-between gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3 transition-colors hover:border-accent/50"
                >
                  <span className="text-[14px] font-medium text-text">{app.name}</span>
                  <span className="tnum text-[13px] text-text-muted">
                    {app.packagesReached}{" "}
                    {app.packagesReached === 1 ? "package" : "packages"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading
          title="Packages"
          description="Ranked by weekly downloads. Marked entries have no other maintainer."
        />
        <Card className="overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-text-subtle">
                <th className="px-4 py-2.5 font-medium">Package</th>
                <th className="px-4 py-2.5 font-medium">Weekly downloads</th>
                <th className="px-4 py-2.5 font-medium">Ownership</th>
              </tr>
            </thead>
            <tbody>
              {person.packages.map((entry) => (
                <tr key={entry.name} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={packageHref(entry.name)}
                      className="font-mono text-[13px] text-accent hover:underline"
                    >
                      {entry.name}
                    </Link>
                  </td>
                  <td className="tnum px-4 py-2.5 text-[13px] text-text-muted">
                    {compactNumber(entry.weeklyDownloads)}
                  </td>
                  <td className="px-4 py-2.5">
                    {entry.soloMaintained ? (
                      <span className="rounded-md bg-high-soft px-1.5 py-0.5 text-[11px] font-medium text-high">
                        sole maintainer
                      </span>
                    ) : (
                      <span className="text-[12px] text-text-subtle">shared</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {person.packageCount > person.packages.length ? (
          <p className="mt-3 text-[12px] text-text-subtle">
            Showing the top {person.packages.length} of {fullNumber(person.packageCount)} packages.
          </p>
        ) : null}
      </section>
    </div>
  );
}
