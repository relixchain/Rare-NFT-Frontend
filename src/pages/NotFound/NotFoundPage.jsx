import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button";

export function NotFoundPage() {
  return (
    <main
      role="main"
      aria-labelledby="not-found-title"
      className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6"
    >
      <div className="text-[11px] font-semibold tracking-[0.25em] text-sky-600 uppercase">
        Not Found
      </div>

      <h1
        id="not-found-title"
        className="mt-2 text-2xl font-extrabold tracking-tight"
      >
        Page not found
      </h1>

      <p className="mt-2 text-sm text-slate-600">
        This page doesn’t exist or the URL may be incorrect.
      </p>

      <div className="mt-5">
        <Link to="/" aria-label="Go back to home">
          <Button>Back to Home</Button>
        </Link>
      </div>
    </main>
  );
}
