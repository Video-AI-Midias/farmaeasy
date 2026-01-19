/**
 * Hook for persisting form data to localStorage with automatic recovery.
 *
 * Features:
 * - Auto-save on data changes
 * - Debounced saves to avoid excessive writes
 * - Clear on completion
 * - Handles browser refresh gracefully
 */
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "farmaeasy_registration_";
const DEBOUNCE_MS = 500;

interface UseFormPersistenceOptions<T> {
  /** Unique key for this form (e.g., shortcode) */
  key: string;
  /** Initial/default values */
  initialData: T;
  /** Callback when restored data is found */
  onRestore?: (data: T) => void;
}

interface UseFormPersistenceReturn<T> {
  /** Current form data */
  data: T;
  /** Update form data (auto-persists) */
  setData: (data: T | ((prev: T) => T)) => void;
  /** Clear persisted data (call on successful submission) */
  clearPersistence: () => void;
  /** Whether restored data was found */
  wasRestored: boolean;
}

export function useFormPersistence<T extends Record<string, unknown>>({
  key,
  initialData,
  onRestore,
}: UseFormPersistenceOptions<T>): UseFormPersistenceReturn<T> {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const [wasRestored, setWasRestored] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Initialize with restored data or default
  const [data, setDataInternal] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as T;
        setWasRestored(true);
        return parsed;
      }
    } catch {
      // Invalid stored data, use initial
      localStorage.removeItem(storageKey);
    }
    return initialData;
  });

  // Call onRestore callback when restored data is found (only once on mount)
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    if (wasRestored && onRestoreRef.current) {
      onRestoreRef.current(data);
    }
  }, [wasRestored, data]);

  // Debounced save to localStorage
  const saveToStorage = useCallback(
    (newData: T) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        try {
          // Don't persist sensitive data like passwords
          const { password: _pw, confirmPassword: _cpw, ...safeData } = newData;

          localStorage.setItem(storageKey, JSON.stringify(safeData));
        } catch {
          // localStorage full or unavailable, ignore
        }
      }, DEBOUNCE_MS);
    },
    [storageKey],
  );

  // Update data and persist
  const setData = useCallback(
    (newData: T | ((prev: T) => T)) => {
      setDataInternal((prev) => {
        const updated = typeof newData === "function" ? newData(prev) : newData;
        saveToStorage(updated);
        return updated;
      });
    },
    [saveToStorage],
  );

  // Clear persistence (call on successful submission)
  const clearPersistence = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return {
    data,
    setData,
    clearPersistence,
    wasRestored,
  };
}

/**
 * Hook to warn user before leaving page with unsaved changes.
 */
export function useBeforeUnload(hasUnsavedChanges: boolean, message?: string) {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        const msg = message || "Você tem dados não salvos. Deseja sair?";
        e.preventDefault();
        // Modern browsers ignore custom message, but we still set it
        e.returnValue = msg;
        return msg;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges, message]);
}
