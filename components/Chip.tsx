import { cn } from "@/lib/ui";

interface ChipProps {
  label: string;
  className?: string;
}

export function Chip({ label, className }: ChipProps) {
  return <span className={cn("tp-chip", className)}>{label}</span>;
}
