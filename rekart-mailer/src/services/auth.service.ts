import apiClient from "@/lib/api";
import type { ApiResponse } from "@/types/api";
import type { AuthTokens, User } from "@/types/auth";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignupPayload {
  fullName: string;
  email: string;
  password: string;
  companyName: string;
}

export interface AuthApiResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshApiResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const authService = {
  signup: (payload: SignupPayload) =>
    apiClient
      .post<ApiResponse<AuthApiResponse>>("/auth/signup", payload)
      .then((r) => r.data.data),

  login: (payload: LoginPayload) =>
    apiClient
      .post<ApiResponse<AuthApiResponse>>("/auth/login", payload)
      .then((r) => r.data.data),

  logout: (refreshToken?: string) =>
    apiClient
      .post<ApiResponse<null>>("/auth/logout", { refreshToken })
      .then((r) => r.data),

  refresh: (refreshToken: string) =>
    apiClient
      .post<ApiResponse<RefreshApiResponse>>("/auth/refresh", { refreshToken })
      .then((r) => r.data.data),

  forgotPassword: (email: string) =>
    apiClient
      .post<ApiResponse<null>>("/auth/forgot-password", { email })
      .then((r) => r.data),

  resetPassword: (token: string, password: string) =>
    apiClient
      .post<ApiResponse<null>>("/auth/reset-password", { token, password })
      .then((r) => r.data),
};

export function extractApiError(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "response" in error
  ) {
    const resp = (error as { response?: { data?: { message?: string } } }).response;
    const msg = resp?.data?.message;
    if (typeof msg === "string") return msg;
    if (Array.isArray(msg)) return msg[0] ?? "Something went wrong";
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
