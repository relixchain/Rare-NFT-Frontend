import { cn } from "../../lib/cn";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-400",
        className
      )}
      {...props}
    />
  );
}
