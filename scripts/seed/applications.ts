/**
 * The six applications whose dependency trees make up the graph.
 *
 * Each is a real, published, self-hostable application — not a library — so
 * "who can reach this application's production build" is a question a real
 * operator would actually ask. Their direct dependencies come from the npm
 * registry rather than a GitHub package.json, because five of the six are
 * monorepos whose root package.json declares no runtime dependencies at all.
 *
 * The spread is deliberate: 31 to 164 direct dependencies, and a mix of
 * React-heavy frontends and pure backend services, so the shared-exposure
 * query has something non-trivial to find.
 */
export interface SeedApplication {
  slug: string;
  name: string;
  description: string;
  /** The published package whose dependency tree defines this application. */
  npmPackage: string;
  repoUrl: string;
  category: string;
}

export const SEED_APPLICATIONS: SeedApplication[] = [
  {
    slug: "n8n",
    name: "n8n",
    description: "Workflow automation platform with a visual node editor.",
    npmPackage: "n8n",
    repoUrl: "https://github.com/n8n-io/n8n",
    category: "Automation",
  },
  {
    slug: "ghost",
    name: "Ghost",
    description: "Publishing platform for newsletters and membership sites.",
    npmPackage: "ghost",
    repoUrl: "https://github.com/TryGhost/Ghost",
    category: "Publishing",
  },
  {
    slug: "strapi",
    name: "Strapi",
    description: "Headless CMS with a customisable admin panel and REST/GraphQL APIs.",
    npmPackage: "@strapi/strapi",
    repoUrl: "https://github.com/strapi/strapi",
    category: "CMS",
  },
  {
    slug: "medusa",
    name: "Medusa",
    description: "Composable commerce engine for building online stores.",
    npmPackage: "@medusajs/medusa",
    repoUrl: "https://github.com/medusajs/medusa",
    category: "E-commerce",
  },
  {
    slug: "docusaurus",
    name: "Docusaurus",
    description: "Static site generator purpose-built for documentation sites.",
    npmPackage: "@docusaurus/core",
    repoUrl: "https://github.com/facebook/docusaurus",
    category: "Documentation",
  },
  {
    slug: "verdaccio",
    name: "Verdaccio",
    description: "Lightweight private npm registry and proxy.",
    npmPackage: "verdaccio",
    repoUrl: "https://github.com/verdaccio/verdaccio",
    category: "Developer tooling",
  },
];
