/**
 * UserCombobox - Advanced user selector with search and infinite scroll.
 *
 * Features:
 * - Debounced search (300ms)
 * - Progressive loading (load more)
 * - Loading and empty states
 * - Keyboard navigation
 * - User avatar/initials
 * - Clear selection
 */

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUserSearch } from "@/hooks/useUserSearch";
import { cn } from "@/lib/utils";
import type { User, UserRole } from "@/types/auth";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

interface UserComboboxProps {
  value?: string;
  onValueChange?: (userId: string | undefined) => void;
  onUserSelect?: (user: User | null) => void;
  role?: UserRole;
  placeholder?: string;
  label?: string;
  required?: boolean;
  error?: string | undefined;
  disabled?: boolean;
  className?: string;
}

function getUserInitials(name: string | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return (name.slice(0, 2) || "??").toUpperCase();
}

export function UserCombobox({
  value,
  onValueChange,
  onUserSelect,
  role,
  placeholder = "Buscar por email ou nome...",
  label,
  required = false,
  error,
  disabled = false,
  className,
}: UserComboboxProps) {
  const [open, setOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const {
    users,
    isSearching,
    hasMore,
    error: searchError,
    searchTerm,
    setSearchTerm,
    loadMore,
    reset,
  } = useUserSearch(role ? { role } : {});

  // Find selected user when value changes
  useEffect(() => {
    if (value && !selectedUser) {
      const user = users.find((u) => u.id === value);
      if (user) {
        setSelectedUser(user);
      }
    }
  }, [value, users, selectedUser]);

  const handleSelect = (user: User) => {
    setSelectedUser(user);
    onValueChange?.(user.id);
    onUserSelect?.(user);
    setOpen(false);
    reset();
  };

  const handleClear = () => {
    setSelectedUser(null);
    onValueChange?.(undefined);
    onUserSelect?.(null);
    reset();
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      reset();
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <Label>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
      )}

      {selectedUser ? (
        <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {getUserInitials(selectedUser.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <p className="text-sm font-medium leading-none">
                {selectedUser.name || selectedUser.email}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedUser.email}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
            className="h-8 px-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Limpar seleção</span>
          </Button>
        </div>
      ) : (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full justify-between",
                !value && "text-muted-foreground",
                error && "border-destructive",
              )}
              disabled={disabled}
            >
              <span className="truncate">{placeholder}</span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <div className="flex flex-col">
              {/* Search Input */}
              <div className="border-b p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={placeholder || "Buscar por email ou nome..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-9"
                    autoFocus
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>

              {/* Results */}
              <ScrollArea className="h-[280px]">
                {searchError && (
                  <div className="p-4 text-center text-sm text-destructive">{searchError}</div>
                )}

                {!searchError && searchTerm.length > 0 && searchTerm.length < 2 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Digite pelo menos 2 caracteres para buscar
                  </div>
                )}

                {!searchError && !isSearching && users.length === 0 && searchTerm.length >= 2 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum usuario encontrado
                  </div>
                )}

                {!searchError && !isSearching && users.length === 0 && searchTerm.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum usuário disponível
                  </div>
                )}

                {!searchError && users.length > 0 && (
                  <div className="p-1">
                    {users.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 rounded-sm px-2 py-2.5",
                          "hover:bg-accent hover:text-accent-foreground",
                          "focus:bg-accent focus:text-accent-foreground focus:outline-none",
                          value === user.id && "bg-accent",
                        )}
                        onClick={() => handleSelect(user)}
                      >
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="text-xs">
                            {getUserInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-1 flex-col items-start gap-0.5 text-left">
                          <p className="text-sm font-medium leading-none">
                            {user.name || user.email}
                          </p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                        {value === user.id && (
                          <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                        )}
                      </button>
                    ))}

                    {hasMore && !isSearching && (
                      <div className="p-2 pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={loadMore}
                        >
                          Carregar mais
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export default UserCombobox;
