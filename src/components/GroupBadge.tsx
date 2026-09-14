import { readableTextColor } from "@/lib/study/groupColors";

export default function GroupBadge({
  name,
  color,
  size = "xs",
}: {
  name: string;
  color?: string | null;
  size?: "xs" | "sm";
}) {
  if (!color) {
    return <span className={`badge badge-ghost badge-${size}`}>{name}</span>;
  }

  return (
    <span
      className={`badge badge-${size} border-0`}
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {name}
    </span>
  );
}
