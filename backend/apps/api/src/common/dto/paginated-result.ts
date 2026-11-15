export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Returned by list endpoints. The response envelope interceptor turns it into
 * `{ success: true, data: items, meta }`.
 */
export class PaginatedResult<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: PaginationMeta,
  ) {}

  static of<T>(items: T[], total: number, page: number, limit: number): PaginatedResult<T> {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return new PaginatedResult(items, {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    });
  }
}
