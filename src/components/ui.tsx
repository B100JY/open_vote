import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";
import { cx } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" &&
          "bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
        variant === "secondary" &&
          "border border-[var(--border)] bg-white text-slate-800 hover:bg-slate-50",
        variant === "danger" &&
          "bg-red-600 text-white hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600",
        variant === "ghost" && "text-slate-700 hover:bg-slate-100",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  const hintId = useId();
  return (
    <label className={cx("grid gap-2", className)}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        className="h-12 rounded-xl border border-[var(--border)] bg-white px-4 text-base outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        aria-describedby={hint ? hintId : undefined}
        {...props}
      />
      {hint ? <span id={hintId} className="text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Textarea({
  label,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className={cx("grid gap-2", className)}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        className="min-h-28 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-base outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        {...props}
      />
    </label>
  );
}

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "ui-panel",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Alert({
  children,
  tone = "danger",
}: {
  children: React.ReactNode;
  tone?: "danger" | "info" | "success" | "warning";
}) {
  return (
    <div
      className={cx(
        "rounded-xl border px-4 py-3 text-sm leading-6",
        tone === "danger" && "border-red-200 bg-red-50 text-red-800",
        tone === "info" && "border-blue-200 bg-blue-50 text-blue-800",
        tone === "success" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="ui-empty flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-slate-50 text-slate-400">
        {icon}
      </div>
      <h2 className="text-base font-medium text-slate-700">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
        {description}
      </p>
    </div>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div role="progressbar" aria-label="투표 비율" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-blue-600 transition-all"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
