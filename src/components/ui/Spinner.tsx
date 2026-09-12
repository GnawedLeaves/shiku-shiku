export default function Spinner({
  size = "md",
  label,
}: {
  size?: "xs" | "sm" | "md" | "lg";
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`loading loading-spinner loading-${size}`} aria-hidden="true" />
      {label ? <span className="text-sm opacity-70">{label}</span> : null}
      <span className="sr-only">{label ?? "Loading"}</span>
    </span>
  );
}
