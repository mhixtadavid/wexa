import Link from "next/link";
import { notFound } from "next/navigation";

import { BlastRadiusDiagram } from "@/components/blast-radius-diagram";
import { Card, Chain, Crumbs, EmptyState, SectionHeading, Stat } from "@/components/ui";
import { compactNumber, maintainerHref } from "@/lib/format";
import { getBlastRadius } from "@/lib/queries/packages";

export const runtime = "nodejs";
export const revalidate = 300;

/**
 * A catch-all segment, because scoped package names contain a slash:
 * `@babel/core` becomes /packages/%40babel/core and arrives as two segments.
 */
function nameFromSegments(segments: string[]): string {
  return segments.map(decodeURIComponent).join("/");
}

export async function generateMetadata({ params }: PageProps<"/packages/[...name]">) {
  const { name } = await params;
  return { title: nameFromSegments(name) + " — Blast Radius" };
}

export default async function PackagePage({ params }: PageProps<"/packages/[...name]">) {
  const { name } = await params;
  const packageName = nameFromSegments(name);

  const radius = await getBlastRadius(packageName);
  if (!radius) notFound();

  const soloMaintained = radius.maintainers.length === 1;

  return (
    <div>
      <Crumbs items={[{ label: "Applications", href: "/" }, { label: packageName }]} />

      <header className="mb-8">
        <h1 className="break-all font-mono text-[24px] font-semibold tracking-tight text-text">
          {packageName}
        </h1>
        {radius.description ? (
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-text-muted">
            {radius.description}
          </p>
        ) : null}
        {radius.repoUrl ? (
          <a
            href={radius.repoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-block text-[13px] text-accent hover:underline"
          >
            Repository
          </a>
        ) : null}
      </header>

      <Card className="mb-8 px-6 py-5">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label="Weekly downloads" value={compactNumber(radius.weeklyDownloads)} />
          <Stat
            label="Maintainers"
            value={String(radius.maintainers.length)}
            hint={soloMaintained ? "single point of failure" : undefined}
            tone={soloMaintained ? "warn" : "default"}
          />
          <Stat label="Versions in graph" value={String(radius.versions.length)} />
          <Stat
            label="Applications reached"
            value={String(radius.affected.length) + " of 6"}
            tone={radius.affected.length >= 5 ? "critical" : "default"}
          />
        </dl>
      </Card>

      <section className="mb-12">
        <SectionHeading
          title="Who can publish this package"
          description={
            soloMaintained
              ? "One person. If this account is compromised, everything below is reachable."
              : "Anyone on this list can publish a new version that lands in every application below."
          }
        />
        <div className="flex flex-wrap gap-2">
          {radius.maintainers.map((username) => (
            <Link
              key={username}
              href={maintainerHref(username)}
              className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 font-mono text-[13px] text-accent transition-colors hover:border-accent/50"
            >
              {username}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          title="Blast radius"
          description="Applications that reach this package, with the shortest chain to it. There are usually many routes; this is the most direct one."
        />
        {radius.affected.length === 0 ? (
          <EmptyState
            title="Not reachable from any application"
            body="This package is in the graph but no seeded application depends on it within 6 hops."
          />
        ) : (
          <>
            <div className="mb-6">
              <BlastRadiusDiagram packageName={packageName} affected={radius.affected} />
            </div>
            <ul className="space-y-3">
            {radius.affected.map((entry) => (
              <li key={entry.slug}>
                <Card className="px-4 py-3.5">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={"/apps/" + entry.slug}
                      className="text-[14px] font-semibold tracking-tight text-text hover:text-accent"
                    >
                      {entry.name}
                    </Link>
                    <span className="tnum text-[12px] text-text-muted">
                      {entry.hops} {entry.hops === 1 ? "hop" : "hops"}
                    </span>
                  </div>
                  <Chain chain={entry.chain} />
                </Card>
              </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="mt-8 text-[12px] text-text-subtle">
        Version count reflects only versions present in these six dependency trees, not everything
        published to npm.
      </p>
    </div>
  );
}
