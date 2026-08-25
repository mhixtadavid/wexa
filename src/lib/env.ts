import { z } from "zod";

/**
 * Connection details are read from the environment and never committed.
 * Validation happens once, at first access, so a misconfigured deployment
 * fails with a readable message instead of a driver-level stack trace.
 */
const envSchema = z.object({
  COGNODB_URI: z
    .string()
    .min(1, "COGNODB_URI is required")
    .refine(
      (uri) => /^(bolt|bolt\+s|bolt\+ssc|neo4j|neo4j\+s|neo4j\+ssc):\/\//.test(uri),
      "COGNODB_URI must be a Bolt URI, e.g. bolt+s://<instance-id>.databases.cognodb.cloud",
    ),
  COGNODB_USER: z.string().min(1, "COGNODB_USER is required").default("cognodb"),
  COGNODB_PASSWORD: z.string().min(1, "COGNODB_PASSWORD is required"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    COGNODB_URI: process.env.COGNODB_URI,
    COGNODB_USER: process.env.COGNODB_USER ?? "cognodb",
    COGNODB_PASSWORD: process.env.COGNODB_PASSWORD,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid CognoDB configuration:\n${issues}\n\nCopy .env.example to .env and fill in your instance details.`,
    );
  }

  cached = parsed.data;
  return cached;
}
