"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLinkStatus } from "next/link";

const items = [
  { href: "/dashboard", label: "Sets" },
  { href: "/study/new", label: "Study" },
  { href: "/history", label: "History" },
  { href: "/friends", label: "Friends" },
  { href: "/settings", label: "Settings" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-iron bg-concrete pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-1 px-2 py-2.5">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-9 flex-1 items-center justify-center rounded-full text-body-sm transition-colors ${
                isActive ? "bg-iron text-concrete" : "text-iron hover:bg-iron/10"
              }`}
            >
              <NavLabel label={item.label} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Swaps the label for a spinner while the navigation it belongs to is pending,
 * so tapping a tab gives immediate feedback on a slow connection.
 */
function NavLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();

  return pending ? (
    <span className="loading loading-spinner loading-xs" aria-label="Loading" />
  ) : (
    <span>{label}</span>
  );
}
