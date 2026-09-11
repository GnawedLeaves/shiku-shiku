"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Sets", icon: "📚" },
  { href: "/study/new", label: "Study", icon: "🔁" },
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
            <span className="text-lg">{item.icon}</span>
            <span className="dock-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
