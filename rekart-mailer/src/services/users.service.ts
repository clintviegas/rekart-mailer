import apiClient from "@/lib/api";
import type { ApiResponse } from "@/types/api";
import type { User } from "@/types/auth";

export const usersService = {
  getMe: () =>
    apiClient
      .get<ApiResponse<User>>("/users/me")
      .then((r) => r.data.data),
};
