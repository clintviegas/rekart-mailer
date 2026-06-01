/** Optional pagination envelope returned by some list endpoints (e.g. SELL journeys). */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  data: T;
  message: string;
  success: boolean;
  meta?: PaginationMeta;
}

export interface PaginatedResponse<T = unknown> {
  data: T[];
  meta: PaginationMeta;
  message: string;
  success: boolean;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
  statusCode: number;
}
