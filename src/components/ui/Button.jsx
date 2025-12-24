// src/components/ui/Button.jsx
import { cn } from "../../lib/cn";

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl " +
    "font-semibold transition active:scale-[0.99] whitespace-nowrap " +
    "disabled:opacity-60 disabled:pointer-events-none";

  // Responsive sizing (mobile: smaller, sm+: normal)
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm",
    lg: "px-4 py-2 text-sm sm:px-5 sm:py-2.5 sm:text-base",
  };

  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    outline: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
  };

  return (
    <button
      type={type}
      className={cn(base, sizes[size], variants[variant], className)}
      {...props}
    />
  );
}
