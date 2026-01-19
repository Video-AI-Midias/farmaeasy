/**
 * Status badge for registration links.
 */
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Link2Off, XCircle } from "lucide-react";

type LinkStatus = "pending" | "used" | "expired" | "revoked";

interface LinkStatusBadgeProps {
  status: LinkStatus;
  className?: string;
}

const statusConfig: Record<
  LinkStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: typeof Clock;
  }
> = {
  pending: {
    label: "Pendente",
    variant: "secondary",
    icon: Clock,
  },
  used: {
    label: "Utilizado",
    variant: "default",
    icon: CheckCircle2,
  },
  expired: {
    label: "Expirado",
    variant: "outline",
    icon: XCircle,
  },
  revoked: {
    label: "Revogado",
    variant: "destructive",
    icon: Link2Off,
  },
};

export function LinkStatusBadge({ status, className }: LinkStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={className}>
      <Icon className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  );
}
