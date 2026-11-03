/** Route-level boundary: authenticated draft and lookup reads stream on navigation. */
export default function LoadingOnboarding() {
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-[560px] px-6 pt-12 pb-10 sm:pt-16"
      aria-busy="true"
    >
      <p role="status" className="text-sm text-fg-muted">
        Preparing your workspace…
      </p>
      <div aria-hidden="true" className="mt-6 h-6 w-3/4 rounded bg-surface-muted" />
      <div aria-hidden="true" className="mt-4 h-4 w-1/2 rounded bg-surface-muted" />
    </main>
  );
}
