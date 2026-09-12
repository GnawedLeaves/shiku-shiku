import Image from "next/image";

const SIZES = {
  sm: 32,
  md: 48,
  lg: 96,
} as const;

/** Profile picture, falling back to the first letter of the person's name. */
export default function Avatar({
  url,
  name,
  size = "md",
}: {
  url?: string | null;
  name?: string | null;
  size?: keyof typeof SIZES;
}) {
  const pixels = SIZES[size];
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";

  if (url) {
    return (
      <div className="avatar">
        <div className="rounded-full" style={{ width: pixels, height: pixels }}>
          <Image
            src={url}
            alt={name ? `${name}'s profile picture` : "Profile picture"}
            width={pixels}
            height={pixels}
            className="rounded-full object-cover"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="avatar avatar-placeholder">
      <div
        className="bg-primary text-primary-content rounded-full grid place-items-center"
        style={{ width: pixels, height: pixels }}
      >
        <span style={{ fontSize: pixels / 2.5 }}>{initial}</span>
      </div>
    </div>
  );
}
