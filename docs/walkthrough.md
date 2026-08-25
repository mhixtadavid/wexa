# Walkthrough

Everything in this project, why it was built that way, and what the
alternatives were. Written to be read before the follow-up interview.

---

## 1. The pitch, in sixty seconds

> You run `npm install` on an application. It declares a few dozen
> dependencies. You actually receive thousands, each one published by someone
> you never chose and will never meet. This app makes that visible: for six
> real self-hostable applications, it shows every package that reaches
> production, every person who can publish into it, and the exact chain by
> which each one arrived.

If you only remember one example, remember this one:

**Verdaccio declares 31 dependencies. It installs 298 packages.** One of them
is `ms`, a tiny helper that turns `"2 days"` into a number. Verdaccio's authors
never asked for it. It arrives by five separate routes:

```
verdaccio → debug@4.4.3 → ms@2.1.3
verdaccio → express@4.22.2 → send@0.19.2 → ms@2.1.3
verdaccio → @verdaccio/url@13.1.2 → debug@4.4.3 → ms@2.1.3
verdaccio → @verdaccio/auth@8.1.2 → debug@4.4.3 → ms@2.1.3
verdaccio → @verdaccio/hooks@8.1.3 → debug@4.4.3 → ms@2.1.3
```

And this one:

| Person | Applications reached | Packages controlled | No second reviewer |
|---|---|---|---|
| `sindresorhus` | **6 of 6** | 158 | 49 |
| `ljharb` | **6 of 6** | 107 | 48 |
| `dougwilson` | **6 of 6** | 57 | 9 |
| `isaacs` | **6 of 6** | 39 | 27 |

One npm password. Six production applications.

**Plain-English framing if the security vocabulary gets in the way:** this is
`npm why` and `npm owner ls`, with a user interface, backed by a graph.

---

## 2. Why a graph database

The honest test applied when choosing this use case: *can you name a question
the app answers that would need a recursive CTE, a self-join of unknown depth,
or a path that SQL cannot express at all?*

Three properties of this problem that a relational schema handles badly.

**1. Depth is unbounded and unknown at query time.** Real dependency trees in
this dataset run to depth 8. You cannot write the joins in advance because you
do not know how many there will be.

**2. The path is the answer, not a by-product.** "Is `ms` reachable from
Verdaccio?" is answerable in SQL. "Show me the five chains that make it
reachable" is what a person actually needs in order to act, and recursive SQL
returns *rows*, not paths. To reconstruct each chain you carry an accumulating
array through the recursion and parse it back out afterwards.

**3. The interesting patterns cross relationship types.** Finding who can
publish into an application walks `REQUIRES` to unknown depth, steps *sideways*
onto `MAINTAINS` (a different relationship, traversed in the opposite
direction), and aggregates. In Cypher that is one pattern:

```cypher
MATCH (a:Application {slug: $slug})-[:DEPENDS_ON|REQUIRES*1..5]->(v:Version)
MATCH (p:Package)-[:HAS_VERSION]->(v)
MATCH (m:Maintainer)-[:MAINTAINS]->(p)
```

In SQL it is a recursive CTE to materialise the closure, which must complete
before a join to the maintainer table can even begin, then a group and rank.

**Where the graph does *not* earn its place, and we say so:** the dashboard
counters are plain aggregates. They are precomputed at seed time precisely
because making the graph compute them live was the wrong tool. Being able to
name where a graph is *not* the answer is worth more than pretending it always
is.

---

## 3. The data model

```
                    ┌──────────────┐
                    │ Application  │  slug, name, description, repoUrl,
                    └──────┬───────┘  + 9 precomputed rollup properties
                           │ DEPENDS_ON { range, scope }
                           ▼
   ┌──────────┐  HAS_VERSION  ┌──────────────┐
   │ Package  │──────────────▶│   Version    │
   └────┬─────┘               └──┬────────┬──┘
        │ ▲ MAINTAINS            │        │ LICENSED_UNDER
        │ │                      │        ▼
   ┌────┴──────────┐             │   ┌──────────┐
   │  Maintainer   │             │   │ License  │
   └───────────────┘             │   └──────────┘
                       REQUIRES  │
                                 ▼
                          ┌──────────────┐   AFFECTS   ┌───────────┐
                          │   Version    │◀────────────│ Advisory  │
                          └──────────────┘             └───────────┘
                                                             ▲
                          (Application)──EXPOSED_TO {hops}────┘
```

### The one modelling decision to defend

**Dependency edges hang off `Version`, not `Package`.**

A package does not depend on anything — a specific *release* does. `lodash`
has no dependencies; `lodash@4.17.20` does. Resolving to one concrete version
per package at seed time mirrors what a lockfile produces and what actually
ships to production.

`MAINTAINS` deliberately stays at the `Package` level, because maintainers own
the *name* across all releases, not any single release.

**The cost of this choice**, which you should volunteer before being asked: it
adds a hop. Getting from one package to another means
`Package → Version → Version → Package`, and every traversal has to pass
through `HAS_VERSION` to recover a human-readable name.

**Why it is worth paying:** the alternative cannot express "you are on 4.17.20,
which is vulnerable, but 4.17.21 is patched." Advisories are version-scoped in
the real world, so the model has to be too.

### Node and relationship counts

| Nodes | | Relationships | |
|---|---:|---|---:|
| Package | 3,206 | MAINTAINS | 11,459 |
| Version | 4,167 | REQUIRES | 10,442 |
| Maintainer | 2,111 | HAS_VERSION | 4,167 |
| Advisory | 127 | LICENSED_UNDER | 4,118 |
| License | 39 | DEPENDS_ON | 522 |
| Application | 6 | AFFECTS | 149 |
| | | EXPOSED_TO | 137 |
| **Total** | **9,656** | **Total** | **30,994** |

Comfortably inside the free c0 tier (0.5 vCPU, 256 MB RAM, 1 GB disk).

---

## 4. The seed pipeline

Four stages, in `scripts/seed/`, deliberately separated.

```
fetch.ts ──▶ data/snapshot.json ──▶ load.ts ──▶ CognoDB
   │                                    
   ├── resolve.ts     BFS walk of the dependency graph
   ├── registry.ts    cached npm client
   ├── advisories.ts  OSV.dev lookups
   └── rollups.ts     exact aggregates + EXPOSED_TO edges
```

### Why fetch and load are separate

The fetch is the only stage that touches the network. Separating it means:

- The graph can be rebuilt against a fresh instance **offline**.
- Anyone cloning the repo gets **identical data** with no npm round-trip and no
  rate-limit risk.
- Re-seeding during development costs 133 seconds, not 39 minutes.

`data/snapshot.json` (3.3 MB) is committed for exactly this reason.

### Why the applications come from npm, not GitHub

The original plan was to read each application's `package.json` from GitHub.
**Five of the six candidates turned out to be monorepos whose root
`package.json` declares zero runtime dependencies** — Excalidraw, Cal.com, n8n,
Docusaurus and Strapi all returned `dependencies: {}`. Only Grafana had any.

So the seed reads the *published* package from the npm registry instead. One
consistent API, and the published artifact is what actually gets deployed.

### Registry access: two document types, chosen by measurement

| Endpoint | Size | Contains |
|---|---:|---|
| Full packument | 242 KB | everything, including maintainers |
| Abbreviated packument | 68 KB | versions + dependency ranges, **no maintainers** |
| `/{name}/{version}` | 2.2 KB | maintainers, licence, description, repo |

The walk uses the **abbreviated** packument (a third the size, and it has
everything the traversal needs). Metadata comes from the **per-version**
manifest — not `/latest` — so maintainers and licence reflect the release
actually in the tree, not whatever the newest release says today. Same cost,
more accurate.

Every response is cached to disk by URL hash. The cache is 560 MB, gitignored,
and turns a 2,323-second cold fetch into 93 seconds.

### Version resolution

Each range is resolved with `semver.maxSatisfying` — the highest stable release
satisfying the range, which is what a package manager does. Non-semver ranges
(`workspace:*`, git URLs, `npm:` aliases) fall back to the `latest` dist-tag.

Result: **0 unresolvable ranges, 10 missing packages** out of 4,167.

### Caps, and why they never fired

Depth capped at 8, packages capped at 12,000, because an uncapped walk of six
large applications does not fit in 256 MB. Neither cap was reached — **the walk
terminated naturally at depth 8** with only 14 versions truncated, so these are
*complete* production trees rather than trimmed ones. That is a stronger claim
and worth making.

### The loader

Twelve stages, each one parameterised statement applied to a batch via `UNWIND`:

```cypher
UNWIND $rows AS row
MERGE (p:Package {name: row.name})
SET p.ecosystem = row.ecosystem, ...
```

- **One round trip and one query plan per 500 rows**, not per row.
- Every `MERGE` targets the exact property its uniqueness constraint covers, so
  it is an index lookup rather than a label scan.
- Chunked at 500 because a 10,000-row transaction will not fit in 256 MB.
- Connectivity is verified **before the first write**, so an unreachable
  instance never leaves a half-loaded graph.
- `--reset` is opt-in and deletes in 2,000-node batches.

**Verified idempotent:** loaded in 133s, re-ran, identical counts.

---

## 5. The queries

All in `src/lib/queries/`. Fourteen functions, all smoke-tested against the
live instance by `npm run db:smoke`.

| Query | What it answers | Time |
|---|---|---:|
| `listApplications` | dashboard cards | 1,654ms |
| `getApplication` | one app's summary | 659ms |
| **Q2** `getMaintainerExposure` | **who can publish into this app** | 3,778ms |
| **Q3** `getSoloMaintainedPackages` | bus factor | 906ms |
| **Q4** `getReachableAdvisories` | reachable vulnerabilities | 871ms |
| **Q6** `getLicenseExposure` | inherited licence obligations | 1,932ms |
| **Q1** `getBlastRadius` | who is hit if this package goes bad | 2,612ms |
| **Q5** `getDependencyPaths` | **why is this here** (`npm why`) | 814ms |
| `getPackage` | package summary | 779ms |
| `getPackageNeighbourhood` | one-hop neighbours | 682ms |
| `getGraphStats` | global counters | 1,225ms |
| `search` | header search | 1,076ms |
| `getMaintainerDetail` | one person's reach | 1,708ms |
| **Q7** `getSharedExposure` | what two apps both depend on | 2,716ms |

### The two headline queries

**Q2 — shared-maintainer exposure.** The one to open with. It is the query
that crosses relationship types, and the one whose SQL equivalent is genuinely
painful.

**Q5 — "why is this here?"** The one that most clearly earns the graph, because
the answer *is* a set of paths of differing lengths. Demo it on
`verdaccio` / `ms` and let the five chains speak.

### Rules every query follows

1. Static Cypher string, values in a params object. **No concatenation, ever.**
2. Every variable-length pattern has an explicit upper bound.
3. Typed row mapper; no `any` crosses the query boundary.
4. `LIMIT` inside Cypher, never applied afterwards in JavaScript.
5. Smoke-tested with its real runtime recorded.

---

## 6. Four CognoDB behaviours we found by running code

None of these are in any tutorial. They are good material — they show the
project was built against a real system, not copied from a guide.

**1. A traversal bound cannot be a parameter.**
`*1..$depth` is a syntax error. Depths are therefore literals in the query
text. Values remain parameters throughout, so nothing is concatenated — the
"no string-concatenated Cypher" requirement is still fully met.

**2. Aggregating inside a map literal nulls the non-aggregated fields.**

```cypher
RETURN { name: p.name, xs: collect(m.username) } AS row
-- returns { name: null, xs: [...] }
```

This silently corrupted three queries. `getPackage` returned `name: null`
while every other field was correct. The fix: aggregate in a `WITH` first,
construct the map only in the final `RETURN`.

**3. `ORDER BY` on a map field silently does not sort.** It returned 18, 2, 25
and reported success. The worst kind of bug — no error, plausible-looking
output. Ordering now always happens on plain variables in a `WITH`, before the
map is built.

**4. Binding an already-matched node into a second traversal exceeds the server
deadline.** Q7's original single-statement form made the planner re-walk the
second application's tree once per candidate package. It timed out even for the
two smallest applications.

---

## 7. Performance decisions, with the measurements behind them

### Traversal depth is bounded at 5, and here is why

Measured on the live instance:

| Depth | Reachable versions | Q2 time | Q2 top result |
|---:|---:|---:|---:|
| 2 | 676 | 438ms | 43 packages |
| 3 | 1,188 | 801ms | 89 |
| 4 | 1,509 | 1,545ms | **94** |
| 5 | 1,653 | 3,933ms | 94 |
| 6 | 1,725 | 12,236ms | 94 |

**Cost grows about 2.5× per hop; the answer converges at depth 4.** Depth 6
costs eight times depth 4 and returns identical results. The reason is that a
variable-length pattern enumerates every *path*, not every reachable *node* —
and n8n reaches `debug` by 476 distinct routes.

### So exact totals are computed outside the database

`scripts/seed/rollups.ts` does a breadth-first sweep over the snapshot's edge
lists in JavaScript. It visits each node once instead of walking every path
into it, so it gets **exact, unbounded** answers in milliseconds. Those land as
properties on the `Application` nodes.

The result: the dashboard reads precomputed properties (an index scan over six
nodes), while interactive exploration stays bounded. Nobody waits.

### Q4 stopped traversing entirely

Computing advisory reachability live meant one `shortestPath` per advisory,
127 times: **11,678ms**. The seed-time BFS already knows every reachable
advisory and its hop distance, so it is materialised as
`(Application)-[:EXPOSED_TO {hops}]->(Advisory)` — 137 edges. The query became
an index lookup: **871ms, a 13× improvement.**

The explanatory path is deliberately *not* fetched with the list. It loads on
demand for the single advisory a user opens, which is both faster and better
interaction design than computing 127 paths nobody asked to see.

### Q7 moved its set intersection to the application layer

Two independent bounded traversals, each ~1s, intersected as a hash join over a
few thousand strings. **The traversals are still the graph's job; only the set
operation moved** — to where it is genuinely cheaper.

---

## 8. Architecture

```
src/app/          routes — RSC pages + 3 API handlers
src/components/   UI primitives, search, banner, diagram
src/lib/db/       driver singleton · session helpers · error normalisation
src/lib/queries/  one function per question, typed
src/lib/api/      error → HTTP mapping
scripts/          schema · seed pipeline · connection check · smoke test
```

### Layering rule

Pages call the query layer directly as Server Components. API routes exist only
where the client genuinely needs to fetch: search-as-you-type, and on-demand
path loading. **Nothing reaches the driver except through
`src/lib/db/session.ts`.**

### Decisions worth defending

**Driver is a module-scoped singleton, not per-request.** It owns a TCP
connection pool; constructing one per request leaks sockets. The pool is capped
at **10** because each warm Vercel lambda holds its own, and the free tier
allows 200 connections total.

**`export const runtime = "nodejs"` on every route touching the database.**
Bolt is a raw TCP protocol and **cannot run on Vercel's Edge runtime**. This is
the single most likely cause of a deploy that works locally and dies in
production.

**Errors split two ways, not one.** `DatabaseUnavailableError` gets a 503, a
`Retry-After` header, a banner and a retry button. `QueryFailedError` gets a
500 and no retry. That distinction is what turns "graceful error handling" from
a claim into something visible on screen.

**Config validated once, loudly.** `src/lib/env.ts` uses Zod and fails with a
readable message naming each missing variable, rather than a driver stack trace.

**The blast-radius diagram is hand-rolled SVG.** `@xyflow/react` was installed
and then **removed**. The layout is deterministic — at most six nodes at known
angles and radii — so a force simulation would have added a client bundle, a
mount-time layout pass and a container-sizing problem in order to arrange six
points on a circle. The SVG renders on the server, ships zero JavaScript,
scales with the viewport, and takes its colours from the same CSS custom
properties as the rest of the page. Production dependencies are down to five.

**Search aborts in-flight requests.** Every keystroke cancels the previous
fetch, and results carry the term they belong to, so a stale response can never
overwrite a newer one.

---

## 9. Known limitations — volunteer these

Being first to name a weakness reads as judgment. Being caught out on one does
not.

**`notFound()` returns HTTP 200 in Next 16.3.2.** The correct page renders;
only the status line is wrong. Ruled out ISR (`force-dynamic` behaves
identically) and the root `loading.tsx` (removing it behaves identically);
unmatched routes *do* return 404. A framework quirk, cosmetic for a human,
wrong for a crawler.

**Licence data is per-version but sampled once.** The licence recorded is the
one on the resolved version in the tree, which is correct — but a package whose
licence changed between releases will only show the one release we hold.

**Maintainers are "who can publish today", not history.** A person who
published a package two years ago and has since been removed does not appear.

**Traversals are bounded at 5 hops.** Data beyond that exists in the graph and
is reflected in the precomputed totals, but the interactive views do not show
it. This is a deliberate latency trade, documented with the numbers above.

**Bot accounts appear alongside humans.** `aws-sdk-bot` tops n8n's exposure
list. That is arguably *correct* — an automation account with publish rights is
a real risk — but the UI does not distinguish them, and it should.

**Weekly downloads are a point-in-time snapshot**, fetched once at seed time.

---

## 10. Questions to expect, and answers

**"Why not a relational database?"**
Point at Q5. The answer to "why is `ms` here" is five chains of differing
lengths. SQL can tell you it is reachable; producing those chains means
carrying an accumulating path array through a recursive CTE and parsing it back
out. Then point at Q2, where the pattern hops between two relationship types
mid-traversal.

**"Isn't this just a dependency tree? Trees are fine in SQL."**
It is not a tree, it is a DAG. `ms` has five distinct parents in Verdaccio
alone. And the query that matters most crosses from the dependency graph into
the maintainer graph, which is a different edge type entirely.

**"Why did you model dependencies on `Version` and not `Package`?"**
Section 3. Lead with the reason, then volunteer the cost.

**"How would this scale to a million packages?"**
Honestly: the interactive traversals would not, at depth 5 on 0.5 vCPU. The
architecture already anticipates it — exact aggregates are precomputed at seed
time and materialised as properties and edges, and that is the direction you
would push further. `EXPOSED_TO` is the pattern: identify the expensive
reachability question, answer it once at write time, read it back as an index
lookup.

**"What was the hardest part?"**
Q7. The natural single-statement form exceeded the server deadline because
binding an already-matched node into a second traversal makes the planner
re-walk the whole subtree per candidate. Splitting it into two bounded
traversals and intersecting in the application layer took it from a timeout to
2.7 seconds.

**"What would you do with another week?"**
Distinguish bot accounts from humans. Add npm 2FA status per maintainer, which
turns "who can publish" into "who can publish *easily*". Materialise more
reachability at write time. Add a scheduled re-seed so the data does not go
stale. Fix the 404 status.

**"Did you use AI to build this?"**
Yes, and the brief permits it. What matters is that every decision here has a
measurement or a reason behind it — the depth bound came from a benchmark, the
`EXPOSED_TO` edge came from an 11.7-second query, the four CognoDB quirks came
from queries that failed. Walk them through one of those and the question
answers itself.

---

## 11. Demo script

Five minutes, in this order:

1. **Home.** "Six real applications. n8n declares 159 dependencies and installs
   1,402 of them, published by 1,205 different people."
2. **`/apps/n8n`.** Scroll to *Who can publish into this application*. "Top of
   that list is an automation account controlling 94 packages inside this one
   app."
3. **Click a package → "Why is this here?"** Let the chains render. "Nobody
   chose this. It arrived through five separate routes."
4. **`/packages/debug`.** The ring diagram. "Each ring is one hop further out.
   Six of six applications."
5. **`/maintainers/sindresorhus`.** "One npm account. 158 packages. Sole
   maintainer of 49 of them. Reaches all six applications."
6. **Pause the CognoDB instance.** The banner appears with a working retry.
   "Graceful degradation when the database is unreachable."
7. **Thirty seconds on the code.** `src/lib/db/session.ts` — every query in the
   application goes through this one file, static Cypher plus a params object.

---

## 12. Commands

```bash
npm run db:check     # verify connectivity, print Bolt version
npm run db:schema    # apply constraints and indexes
npm run seed:fetch   # build data/snapshot.json from npm + OSV
npm run seed:load    # load the snapshot into CognoDB (idempotent)
npm run db:smoke     # run all 14 queries, print timings
npm run dev          # local development
npm run build        # production build
```
