import Link from "next/link";

import { Card, SectionHeading } from "@/components/ui";

export const metadata = { title: "How it works — Blast Radius" };

const NODES = [
  ["Application", "One of six self-hostable apps whose tree is loaded"],
  ["Package", "An npm package name"],
  ["Version", "One published release — where dependencies actually live"],
  ["Maintainer", "An npm account with publish rights"],
  ["Advisory", "A security advisory from OSV.dev"],
  ["License", "An SPDX identifier, classified by obligation"],
];

const EDGES = [
  ["(Application)-[:DEPENDS_ON]->(Version)", "A declared dependency"],
  ["(Package)-[:HAS_VERSION]->(Version)", "Groups releases under a name"],
  ["(Version)-[:REQUIRES]->(Version)", "The transitive spine"],
  ["(Maintainer)-[:MAINTAINS]->(Package)", "Publish rights"],
  ["(Advisory)-[:AFFECTS]->(Version)", "A known vulnerability"],
  ["(Version)-[:LICENSED_UNDER]->(License)", "Licence terms"],
];

export default function AboutPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-[26px] font-semibold tracking-tight text-text">How this works</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
        Every question here is about a chain of connections, which is why the data lives in a
        graph database rather than a set of tables.
      </p>

      <section className="mt-10">
        <SectionHeading title="The data" />
        <p className="text-[14px] leading-relaxed text-text-muted">
          Six real applications — n8n, Ghost, Strapi, Medusa, Docusaurus and Verdaccio — walked
          from their published npm manifests through every production dependency, resolving each
          version range the way a package manager would. Security advisories come from OSV.dev.
          Nothing here is synthetic.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-text-muted">
          The result is 9,656 nodes and roughly 31,000 relationships. The walk terminated
          naturally at depth 8, so these are complete production trees rather than truncated ones.
        </p>
      </section>

      <section className="mt-10">
        <SectionHeading title="The model" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="px-4 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-subtle">
              Nodes
            </p>
            <dl className="space-y-2">
              {NODES.map(([label, description]) => (
                <div key={label}>
                  <dt className="font-mono text-[13px] text-text">{label}</dt>
                  <dd className="text-[12px] text-text-muted">{description}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="px-4 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-subtle">
              Relationships
            </p>
            <dl className="space-y-2">
              {EDGES.map(([label, description]) => (
                <div key={label}>
                  <dt className="break-all font-mono text-[12px] text-text">{label}</dt>
                  <dd className="text-[12px] text-text-muted">{description}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-text-muted">
          Dependency edges hang off <span className="font-mono text-[13px]">Version</span>, not{" "}
          <span className="font-mono text-[13px]">Package</span>, because a package does not
          depend on anything — a specific release does. That is what makes it possible to say
          &ldquo;you are on 4.17.20, which is vulnerable, but 4.17.21 is patched&rdquo;.
        </p>
      </section>

      <section className="mt-10">
        <SectionHeading title="Why a graph database" />
        <p className="text-[14px] leading-relaxed text-text-muted">
          Three properties of this problem that a relational schema handles badly:
        </p>
        <ol className="mt-3 space-y-3 text-[14px] leading-relaxed text-text-muted">
          <li>
            <strong className="text-text">Depth is unbounded.</strong> Real trees run eight or
            more levels deep, and the depth is not known when the question is asked.
          </li>
          <li>
            <strong className="text-text">The path is the answer.</strong> &ldquo;Is this package
            reachable&rdquo; is answerable in SQL. &ldquo;Show me the chain that makes it
            reachable&rdquo; is what a person actually needs, and recursive SQL returns rows, not
            paths.
          </li>
          <li>
            <strong className="text-text">Patterns cross relationship types.</strong> Finding who
            can publish into an application walks{" "}
            <span className="font-mono text-[13px]">REQUIRES</span> to unknown depth, then steps
            sideways onto <span className="font-mono text-[13px]">MAINTAINS</span>. That is one
            Cypher pattern and several chained recursive CTEs in SQL.
          </li>
        </ol>
      </section>

      <section className="mt-10">
        <SectionHeading title="Reading the numbers" />
        <p className="text-[14px] leading-relaxed text-text-muted">
          Interactive traversals are bounded at five hops. Cost grows about 2.5&times; per hop
          because a variable-length pattern enumerates every path, while the answer converges by
          about hop four. Exact unbounded totals — the counts on each application card — are
          computed once when the graph is loaded, so the dashboard never pays for a traversal.
        </p>
      </section>

      <p className="mt-10 text-[14px]">
        <Link href="/" className="text-accent hover:underline">
          Back to applications
        </Link>
      </p>
    </div>
  );
}
