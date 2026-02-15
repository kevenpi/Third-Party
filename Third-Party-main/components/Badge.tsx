import { cn } from "@/lib/ui";

interface BadgeProps {
  children: string;
  className?: string;
}

export function Badge({ children, className }: BadgeProps) {
  return <span className={cn("tp-badge", className)}>{children}</span>;
}
