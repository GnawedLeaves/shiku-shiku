"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLinkStatus } from "next/link";

const items = [
  { href: "/dashboard", label: "Sets", icon: "📚" },
  { href: "/study/new", label: "Study", icon: "🔁" },
  { href: "/history", label: "History", icon: "📈" },
  { href: "/friends", label: "Friends", icon: "🤝" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="dock">
      {items.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={isActive ? "dock-active" : ""}>
            <NavIcon icon={item.icon} />
            <span className="dock-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Swaps the icon for a spinner while the navigation it belongs to is pending,
 * so tapping a tab gives immediate feedback on a slow connection.
 */
function NavIcon({ icon }: { icon: string }) {
  const { pending } = useLinkStatus();

  return pending ? (
    <span className="loading loading-spinner loading-xs" aria-label="Loading" />
  ) : (
    <span className="text-lg">{icon}</span>
  );
}
