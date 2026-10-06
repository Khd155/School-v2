"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "بيانات الطلاب" },
  { href: "/admin/codes", label: "رموز الوصول" },
  { href: "/admin/school", label: "معلومات المدرسة" },
  { href: "/admin/account", label: "الحساب" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="أقسام لوحة المعلم">
      <div className="admin-nav-inner">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
