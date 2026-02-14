import { ReactNode } from "react";
import { cn } from "@/lib/ui";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return <div className={cn("tp-card", className)}>{children}</div>;
}
