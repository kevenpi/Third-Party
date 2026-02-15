"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui";

const links = [
  { href: "/", label: "Today" },
  { href: "/timeline", label: "Recap" },
  { href: "/session", label: "Therapy" }
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="tp-nav-wrap">
      <div className="tp-shell tp-nav">
        <div>
          <Link href="/" className="tp-logo">
            ThirdParty
          </Link>
          <p className="tp-logo-sub">Daily relationship recap, guided journal, and shared repair coaching</p>
        </div>
        <nav>
          <ul className="tp-nav-list">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn("tp-nav-link", active && "tp-nav-link-active")}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
