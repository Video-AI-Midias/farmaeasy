/**
 * Auth store using Zustand with persist middleware.
 *
 * Token strategy:
 * - Access token: stored in memory (not persisted for security)
 * - Refresh token: stored in httpOnly cookie (handled by backend)
 * - User data: persisted to localStorage for UX
 */

import { authApi, setAccessToken, setOnAuthError, setOnTokenRefreshed } from "@/lib/api";
import { normalizeCPF, normalizePhone } from "@/lib/validators";
import type {
  AuthState,
  AuthStore,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  UpdateProfileRequest,
  User,
} from "@/types/auth";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Initial state
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
};

/**
 * Auth store with Zustand
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Setters
      setUser: (user: User | null) =>
        set({
          user,
          isAuthenticated: user !== null,
        }),

      setLoading: (isLoading: boolean) => set({ isLoading }),

      setInitialized: (isInitialized: boolean) => set({ isInitialized }),

      // Login action
      login: async (credentials: LoginRequest) => {
        // Prevent duplicate login attempts
        if (get().isLoading) {
          return;
        }
        set({ isLoading: true });
        try {
          const response = await authApi.login(credentials);
          setAccessToken(response.tokens.access_token);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Register action
      register: async (data: RegisterRequest) => {
        // Prevent duplicate registration attempts
        if (get().isLoading) {
          return;
        }
        set({ isLoading: true });
        try {
          // Normalize CPF and phone before sending
          const normalizedData = {
            ...data,
            cpf: normalizeCPF(data.cpf),
            phone: normalizePhone(data.phone),
          };
          const response = await authApi.register(normalizedData);
          setAccessToken(response.tokens.access_token);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Logout action
      logout: async () => {
        set({ isLoading: true });
        try {
          await authApi.logout();
        } catch {
          // Continue with logout even if API call fails
        } finally {
          setAccessToken(null);
          set({
            ...initialState,
            isInitialized: true,
          });
        }
      },

      // Refresh auth (called on app init)
      refreshAuth: async () => {
        const { isInitialized, isLoading } = get();

        // Prevent multiple simultaneous refresh attempts
        if (isInitialized || isLoading) return;

        set({ isLoading: true, isInitialized: true });

        try {
          const tokenResponse = await authApi.refresh();
          setAccessToken(tokenResponse.access_token);

          const user = await authApi.me();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          // Refresh failed - user needs to login again
          setAccessToken(null);
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      // Update profile
      updateProfile: async (data: UpdateProfileRequest) => {
        // Prevent duplicate update attempts
        if (get().isLoading) {
          return;
        }
        set({ isLoading: true });
        try {
          const updatedUser = await authApi.updateProfile(data);
          set({
            user: updatedUser,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Change password
      changePassword: async (data: ChangePasswordRequest) => {
        // Prevent duplicate password change attempts
        if (get().isLoading) {
          return;
        }
        set({ isLoading: true });
        try {
          await authApi.changePassword(data);
          set({ isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Reset store (keeps isInitialized to prevent re-init loop)
      reset: () => {
        setAccessToken(null);
        set({
          ...initialState,
          isInitialized: true,
        });
      },
    }),
    {
      name: "farmaeasy-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist user data, not tokens or loading states
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

// Setup API interceptor callbacks
setOnTokenRefreshed((token) => {
  setAccessToken(token);
});

setOnAuthError(() => {
  useAuthStore.getState().reset();
});

export default useAuthStore;
