import Link from "next/link";

import { Card, EmptyState, SectionHeading } from "@/components/ui";
import { compactNumber, packageHref } from "@/lib/format";
import { listApplications } from "@/lib/queries/applications";
import { getSharedExposure } from "@/lib/queries/overview";

export const runtime = "nodejs";
export const revalidate = 300;

export const metadata = { title: "Compare applications — Blast Radius" };

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const params = await searchParams;
  const applications = await listApplications();

  const slugs = new Set(applications.map((app) => app.slug));
  const rawA = typeof params.a === "string" ? params.a : undefined;
  const rawB = typeof params.b === "string" ? params.b : undefined;
  const slugA = rawA && slugs.has(rawA) ? rawA : undefined;
  const slugB = rawB && slugs.has(rawB) ? rawB : undefined;

  const bothChosen = Boolean(slugA && slugB && slugA !== slugB);
  const shared = bothChosen ? await getSharedExposure(slugA!, slugB!) : [];

  const nameOf = (slug?: string) => applications.find((app) => app.slug === slug)?.name ?? "";

  return (
    <div>
      <header className="mb-8 max-w-3xl">
        <h1 className="text-[26px] font-semibold tracking-tight text-text">
          Shared exposure
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
          Two applications, and the packages they both depend on. Anything appearing here is a
          single point of failure for both at once — and the deeper it sits in each tree, the less
          likely either team knows it is there.
        </p>
      </header>

      {/* Plain links rather than a form: the selection is the URL, so every
          comparison is shareable and the back button behaves. */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {(["a", "b"] as const).map((slot) => {
          const current = slot === "a" ? slugA : slugB;
          const other = slot === "a" ? slugB : slugA;
          return (
            <Card key={slot} className="px-4 py-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-subtle">
                {slot === "a" ? "First application" : "Second application"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {applications.map((app) => {
                  const selected = current === app.slug;
                  const disabled = other === app.slug;
                  const next = new URLSearchParams();
                  if (slot === "a") {
                    next.set("a", app.slug);
                    if (slugB) next.set("b", slugB);
                  } else {
                    if (slugA) next.set("a", slugA);
                    next.set("b", app.slug);
                  }
                  return disabled ? (
                    <span
                      key={app.slug}
                      className="cursor-not-allowed rounded-md border border-border-subtle px-2.5 py-1 text-[12px] text-text-subtle opacity-50"
                    >
                      {app.name}
                    </span>
                  ) : (
                    <Link
                      key={app.slug}
                      href={"/compare?" + next.toString()}
                      className={
                        "rounded-md border px-2.5 py-1 text-[12px] transition-colors " +
                        (selected
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border-subtle text-text-muted hover:border-accent/50 hover:text-text")
                      }
                    >
                      {app.name}
                    </Link>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {!bothChosen ? (
        <EmptyState
          title="Pick two applications"
          body="Choose one from each list above to see every package that reaches both of them, and how deep it sits in each tree."
        />
      ) : (
        <section>
          <SectionHeading
            title={
              shared.length + " packages reach both " + nameOf(slugA) + " and " + nameOf(slugB)
            }
            description="Hop counts are the shortest distance from each application. A package four hops deep in both is shared risk that neither team chose."
          />
          {shared.length === 0 ? (
            <EmptyState
              title="No shared packages within 4 hops"
              body="These two applications do not have overlapping dependencies at this traversal depth."
            />
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-text-subtle">
                    <th className="px-4 py-2.5 font-medium">Package</th>
                    <th className="px-4 py-2.5 font-medium">Maintainers</th>
                    <th className="px-4 py-2.5 font-medium">{nameOf(slugA)}</th>
                    <th className="px-4 py-2.5 font-medium">{nameOf(slugB)}</th>
                    <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Weekly</th>
                  </tr>
                </thead>
                <tbody>
                  {shared.map((row) => (
                    <tr
                      key={row.packageName}
                      className="border-b border-border-subtle last:border-0"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={packageHref(row.packageName)}
                          className="font-mono text-[13px] text-accent hover:underline"
                        >
                          {row.packageName}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        {row.maintainerCount === 1 ? (
                          <span className="rounded-md bg-high-soft px-1.5 py-0.5 text-[11px] font-medium text-high">
                            1 person
                          </span>
                        ) : (
                          <span className="tnum text-[13px] text-text-muted">
                            {row.maintainerCount}
                          </span>
                        )}
                      </td>
                      <td className="tnum px-4 py-2.5 text-[13px] text-text-muted">
                        {row.hopsA} {row.hopsA === 1 ? "hop" : "hops"}
                      </td>
                      <td className="tnum px-4 py-2.5 text-[13px] text-text-muted">
                        {row.hopsB} {row.hopsB === 1 ? "hop" : "hops"}
                      </td>
                      <td className="tnum hidden px-4 py-2.5 text-[13px] text-text-muted sm:table-cell">
                        {compactNumber(row.weeklyDownloads)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
