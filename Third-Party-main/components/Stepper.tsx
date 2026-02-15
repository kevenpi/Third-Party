import { cn } from "@/lib/ui";

interface StepperProps {
  current: number;
  total: number;
  className?: string;
}

export function Stepper({ current, total, className }: StepperProps) {
  const percentage = total === 0 ? 0 : Math.round((current / total) * 100);
  return (
    <div className={cn("tp-stepper", className)}>
      <div className="tp-stepper-top">
        <span>{current} of {total}</span>
        <span>{percentage}%</span>
      </div>
      <div className="tp-stepper-track">
        <div className="tp-stepper-fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
