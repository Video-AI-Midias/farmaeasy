import { cn } from "@/lib/utils";
import { MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";

const WHATSAPP_NUMBER = "5535998137600";
const WHATSAPP_MESSAGE = encodeURIComponent(
  "Olá! Tenho interesse no FarmaEasy. Gostaria de saber mais informações.",
);

export function WhatsAppBubble() {
  const [isVisible, setIsVisible] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    // Show bubble after 2 seconds
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Show tooltip after bubble appears (only once)
    if (isVisible && !hasInteracted) {
      const tooltipTimer = setTimeout(() => {
        setShowTooltip(true);
      }, 3000);

      // Auto-hide tooltip after 8 seconds
      const hideTimer = setTimeout(() => {
        setShowTooltip(false);
      }, 11000);

      return () => {
        clearTimeout(tooltipTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [isVisible, hasInteracted]);

  const handleClick = () => {
    setHasInteracted(true);
    setShowTooltip(false);
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MESSAGE}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleCloseTooltip = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowTooltip(false);
    setHasInteracted(true);
  };

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "fixed right-4 md:right-6 bottom-6 z-50 flex items-end gap-3",
        "animate-in fade-in zoom-in duration-300",
      )}
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Tooltip - hidden on very small screens */}
      {showTooltip && (
        <div
          className={cn(
            "relative bg-card rounded-2xl shadow-xl border border-border p-4 max-w-[240px] mb-2",
            "hidden sm:block animate-in fade-in slide-in-from-right-4 duration-300",
          )}
        >
          {/* Arrow pointing to bubble */}
          <div className="absolute -right-2 bottom-6 w-4 h-4 bg-card border-r border-b border-border rotate-[-45deg]" />

          {/* Close button */}
          <button
            type="button"
            onClick={handleCloseTooltip}
            className="absolute -top-2 -right-2 w-6 h-6 bg-muted rounded-full flex items-center justify-center hover:bg-muted/80 transition-colors"
          >
            <X className="w-3 h-3 text-muted-foreground" />
          </button>

          <p className="text-sm font-medium text-foreground mb-1">Tem interesse ou dúvidas?</p>
          <p className="text-xs text-muted-foreground">Fale conosco no WhatsApp!</p>
        </div>
      )}

      {/* WhatsApp Bubble */}
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "relative w-14 h-14 bg-[#25D366] rounded-full shadow-lg",
          "flex items-center justify-center",
          "hover:bg-[#20BA5C] hover:scale-110 active:scale-95",
          "transition-all duration-200",
        )}
        aria-label="Conversar no WhatsApp"
      >
        {/* Pulse animation */}
        <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-40" />

        {/* Icon */}
        <MessageCircle className="w-7 h-7 text-white fill-white relative z-10" />

        {/* Notification dot */}
        <span
          className={cn(
            "absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full",
            "flex items-center justify-center",
            "animate-in zoom-in duration-500 delay-500",
          )}
        >
          <span className="text-[10px] font-bold text-white">1</span>
        </span>
      </button>
    </div>
  );
}

export default WhatsAppBubble;
