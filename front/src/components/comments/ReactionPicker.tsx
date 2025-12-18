/**
 * Reaction picker component with emoji buttons.
 *
 * Shows reaction emojis and allows users to add/remove reactions.
 */

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  type ReactionCounts,
  type ReactionType,
  ReactionTypes,
  reactionEmojis,
  reactionLabels,
} from "@/types/comments";
import { SmilePlus } from "lucide-react";
import { useState } from "react";

interface ReactionPickerProps {
  reactions: ReactionCounts;
  userReaction: ReactionType | null;
  onReact: (reaction: ReactionType) => void;
  onRemoveReaction: () => void;
  disabled?: boolean;
}

export function ReactionPicker({
  reactions,
  userReaction,
  onReact,
  onRemoveReaction,
  disabled = false,
}: ReactionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Get total reaction count
  const totalReactions = Object.values(reactions).reduce((sum, count) => sum + count, 0);

  // Get reactions that have at least 1 count
  const activeReactions = (Object.entries(reactions) as [ReactionType, number][]).filter(
    ([_, count]) => count > 0,
  );

  const handleReaction = (reaction: ReactionType) => {
    if (userReaction === reaction) {
      onRemoveReaction();
    } else {
      onReact(reaction);
    }
    setIsOpen(false);
  };

  return (
    <div className="flex items-center gap-1">
      {/* Show active reactions as buttons */}
      {activeReactions.map(([type, count]) => (
        <Button
          key={type}
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => handleReaction(type)}
          className={cn(
            "h-7 px-2 text-xs gap-1",
            userReaction === type && "bg-primary/10 hover:bg-primary/20",
          )}
          title={reactionLabels[type]}
        >
          <span>{reactionEmojis[type]}</span>
          <span className={cn(userReaction === type && "font-semibold")}>{count}</span>
        </Button>
      ))}

      {/* Add reaction button with popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="h-7 px-2"
            title="Adicionar reacao"
          >
            <SmilePlus className="h-4 w-4" />
            {totalReactions === 0 && <span className="ml-1 text-xs">Reagir</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-1">
            {Object.values(ReactionTypes).map((type) => (
              <Button
                key={type}
                variant="ghost"
                size="sm"
                onClick={() => handleReaction(type)}
                className={cn(
                  "h-9 w-9 p-0 text-lg hover:scale-125 transition-transform",
                  userReaction === type && "bg-primary/10",
                )}
                title={reactionLabels[type]}
              >
                {reactionEmojis[type]}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default ReactionPicker;
