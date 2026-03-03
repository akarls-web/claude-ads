"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Link2,
  ClipboardList,
} from "lucide-react";
import { SterlingXMark } from "@/components/ui/sterlingx-logo";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/connect", label: "Connect", icon: Link2 },
  { href: "/audits", label: "Audits", icon: ClipboardList },
];

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border-light bg-white md:block">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex items-center gap-2.5 border-b border-border-light px-6 py-4">
            <SterlingXMark size={24} />
            <span className="font-heading text-body font-bold tracking-tight text-text-primary">
              SterlingX
            </span>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-small font-medium transition-colors ${
                    isActive
                      ? "bg-brand-wash text-brand"
                      : "text-text-secondary hover:bg-brand-wash/50 hover:text-text-primary"
                  }`}
                >
                  <item.icon className="h-5 w-5" strokeWidth={1.75} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User */}
          <div className="border-t border-border-light p-4">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border-light bg-white px-6 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <SterlingXMark size={20} />
            <span className="font-heading text-small font-bold text-text-primary">
              SterlingX
            </span>
          </div>
          <div className="flex items-center gap-3">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" &&
                  pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md p-2 transition-colors ${
                    isActive
                      ? "bg-brand-wash text-brand"
                      : "text-text-secondary hover:text-brand"
                  }`}
                >
                  <item.icon className="h-5 w-5" strokeWidth={1.75} />
                </Link>
              );
            })}
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
