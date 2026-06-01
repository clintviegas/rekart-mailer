export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function createResponse<T>(
  data: T,
  message = 'Success',
  meta?: PaginationMeta,
): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    ...(meta && { meta }),
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  message: string,
  page: number,
  limit: number,
  total: number,
): ApiResponse<T[]> {
  return {
    success: true,
    message,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
