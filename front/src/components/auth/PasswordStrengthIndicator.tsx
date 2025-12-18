/**
 * Password strength indicator component.
 */

import { cn } from "@/lib/utils";
import { getPasswordStrength } from "@/lib/validators";

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

const strengthColors: Record<number, string> = {
  0: "bg-red-500",
  1: "bg-orange-500",
  2: "bg-yellow-500",
  3: "bg-lime-500",
  4: "bg-green-500",
};

const strengthLabels: Record<number, string> = {
  0: "Fraca",
  1: "Razoável",
  2: "Boa",
  3: "Forte",
  4: "Muito forte",
};

export function PasswordStrengthIndicator({ password, className }: PasswordStrengthIndicatorProps) {
  if (!password) return null;

  const strength = getPasswordStrength(password);
  const percentage = (strength.score / 4) * 100;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Força da senha</span>
        <span
          className={cn(
            "font-medium",
            strength.score >= 3 ? "text-green-600" : "text-muted-foreground",
          )}
        >
          {strengthLabels[strength.score]}
        </span>
      </div>

      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all duration-300", strengthColors[strength.score])}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {strength.feedback.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {strength.feedback.map((item) => (
            <li key={item} className="flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PasswordStrengthIndicator;
