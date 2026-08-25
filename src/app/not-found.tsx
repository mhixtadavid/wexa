import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <h1 className="text-lg font-semibold tracking-tight text-text">Not found</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
        That package, person or application is not part of this graph. It only contains the
        dependency trees of the six seeded applications.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        Back to applications
      </Link>
    </div>
  );
}
