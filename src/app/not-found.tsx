import Link from "next/link";
export default function NotFound() {
  return (
    <main className="loading-page">
      <h1>This page isn’t in the workspace.</h1>
      <p>Return to the overview to continue.</p>
      <Link className="btn primary" href="/overview">
        Back to overview
      </Link>
    </main>
  );
}
