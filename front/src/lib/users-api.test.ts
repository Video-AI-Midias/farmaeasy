/**
 * Tests for users API client.
 *
 * TDD RED Phase tests for teacher search functionality.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the api module
vi.mock("./api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("usersApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("searchUsersForTeacher", () => {
    it("should call /auth/users/search endpoint", async () => {
      const { api } = await import("./api");
      const { usersApi } = await import("./users-api");

      vi.mocked(api.get).mockResolvedValue({
        data: { items: [], total: 0 },
      });

      await usersApi.searchUsersForTeacher({});

      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/auth/users/search"));
    });

    it("should pass search parameter", async () => {
      const { api } = await import("./api");
      const { usersApi } = await import("./users-api");

      vi.mocked(api.get).mockResolvedValue({
        data: { items: [], total: 0 },
      });

      await usersApi.searchUsersForTeacher({ search: "maria" });

      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("search=maria"));
    });

    it("should pass limit parameter", async () => {
      const { api } = await import("./api");
      const { usersApi } = await import("./users-api");

      vi.mocked(api.get).mockResolvedValue({
        data: { items: [], total: 0 },
      });

      await usersApi.searchUsersForTeacher({ limit: 50 });

      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("limit=50"));
    });

    it("should return items and total", async () => {
      const { api } = await import("./api");
      const { usersApi } = await import("./users-api");

      const mockUsers = [
        { id: "1", email: "maria@test.com", name: "Maria", role: "student" },
        { id: "2", email: "joao@test.com", name: "João", role: "user" },
      ];

      vi.mocked(api.get).mockResolvedValue({
        data: { items: mockUsers, total: 2 },
      });

      const result = await usersApi.searchUsersForTeacher({});

      expect(result.items).toEqual(mockUsers);
      expect(result.total).toBe(2);
    });
  });

  describe("createStudent", () => {
    it("should call /auth/users/student endpoint with POST", async () => {
      const { api } = await import("./api");
      const { usersApi } = await import("./users-api");

      const mockResponse = {
        user: { id: "1", email: "test@test.com", role: "student" },
        course_access_granted: false,
        welcome_email_sent: true,
      };

      vi.mocked(api.post).mockResolvedValue({
        data: mockResponse,
      });

      await usersApi.createStudent({
        email: "test@test.com",
        password: "Password123!",
      });

      expect(api.post).toHaveBeenCalledWith("/auth/users/student", expect.any(Object));
    });

    it("should pass all student data in request body", async () => {
      const { api } = await import("./api");
      const { usersApi } = await import("./users-api");

      vi.mocked(api.post).mockResolvedValue({
        data: {
          user: { id: "1", email: "test@test.com" },
          course_access_granted: false,
          welcome_email_sent: false,
        },
      });

      const studentData = {
        email: "maria@test.com",
        password: "Senha123!",
        name: "Maria Silva",
        phone: "11999999999",
        cpf: "12345678909",
        send_welcome_email: true,
      };

      await usersApi.createStudent(studentData);

      expect(api.post).toHaveBeenCalledWith("/auth/users/student", studentData);
    });

    it("should return create student response", async () => {
      const { api } = await import("./api");
      const { usersApi } = await import("./users-api");

      const mockResponse = {
        user: { id: "1", email: "test@test.com", role: "student", name: "Maria" },
        course_access_granted: true,
        acquisition_id: "acq-123",
        welcome_email_sent: true,
      };

      vi.mocked(api.post).mockResolvedValue({
        data: mockResponse,
      });

      const result = await usersApi.createStudent({
        email: "test@test.com",
        password: "Password123!",
      });

      expect(result.user.id).toBe("1");
      expect(result.welcome_email_sent).toBe(true);
      expect(result.course_access_granted).toBe(true);
      expect(result.acquisition_id).toBe("acq-123");
    });
  });

  describe("searchUsers (admin)", () => {
    it("should call /auth/users endpoint for admin", async () => {
      const { api } = await import("./api");
      const { usersAdminApi } = await import("./users-api");

      vi.mocked(api.get).mockResolvedValue({
        data: { items: [], total: 0 },
      });

      await usersAdminApi.searchUsers({});

      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/auth/users"));
      expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining("/auth/users/search"));
    });
  });
});
