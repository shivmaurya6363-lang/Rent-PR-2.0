"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkProps extends Omit<React.ComponentProps<typeof NextLink>, "href" | "className"> {
  to: string;
  className?: string;
  activeClassName?: string;
  end?: boolean;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ className, activeClassName, to, end, ...props }, ref) => {
    const pathname = usePathname() ?? "/";
    const isActive = end || to === "/" ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
    return <NextLink ref={ref} href={to} className={cn(className, isActive && activeClassName)} {...props} />;
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
