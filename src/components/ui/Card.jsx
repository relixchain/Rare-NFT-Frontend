import { cn } from "../../lib/cn";

export function Card({ className, ...props }) {
  return (
    <div
      className={cn("rounded-3xl border border-slate-200 bg-white shadow-sm", className)}
      {...props}
    />
  );
}
