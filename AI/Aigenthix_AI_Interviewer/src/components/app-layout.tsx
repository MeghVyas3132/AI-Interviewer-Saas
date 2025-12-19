"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  ClipboardPenLine,
  Mic,
  History,
  Settings,
  FileText,
} from "lucide-react";
import Image from "next/image";
import { Button } from "./ui/button";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, tooltip: "Dashboard" },
  { href: "/prepare", label: "Prepare", icon: ClipboardPenLine, tooltip: "Prepare Interview" },
  { href: "/interview", label: "Interview", icon: Mic, tooltip: "Mock Interview" },
  { href: "/summary", label: "Results", icon: History, tooltip: "Interview Results" },
  { href: "/reports", label: "Reports", icon: FileText, tooltip: "AI Interview Reports" },
  { href: "/admin", label: "Admin", icon: Settings, tooltip: "Admin Panel" },
];

function AppLayoutInternal({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { toggleSidebar } = useSidebar();

  return (
    <>
      <Sidebar collapsible="icon" variant="floating">
        <SidebarHeader>
          <div className="flex items-center justify-between relative">
            <div className="flex justify-center w-full py-3">
              <Image src="/sidelogo.png" alt="Aigenthix AI Sidebar Logo" width={64} height={64} />
            </div>
            <button
              aria-label="Toggle Sidebar"
              onClick={toggleSidebar}
              className="absolute -right-3 top-8 hidden md:flex h-6 w-6 items-center justify-center rounded-full bg-white text-gray-500 shadow-lg border border-slate-200 hover:text-gray-700"
            >
              <span className="sr-only">Toggle</span>
              {/* simple chevron via unicode */}
              <span>❯</span>
            </button>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={{ children: link.tooltip, side: 'right' }}
                    className={`rounded-full h-10 px-4 transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-[#4F63F0] to-[#8B5CF6] text-white shadow-[0_8px_24px_rgba(79,99,240,0.35)] font-medium [&_*]:text-white'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50'
                    }`}
                  >
                    <Link 
                      href={link.href}
                      prefetch={true}
                      scroll={true}
                      className="w-full"
                    >
                      <span className="flex items-center gap-2">
                        <link.icon />
                        <span className="group-data-[state=collapsed]:hidden text-[14px] font-medium">{link.label}</span>
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="p-4 md:hidden flex justify-end">
            <Button size="icon" variant="outline" onClick={toggleSidebar}>
                <LayoutDashboard/>
            </Button>
        </header>
        {children}
        </SidebarInset>
    </>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppLayoutInternal>{children}</AppLayoutInternal>
    </SidebarProvider>
  );
}
