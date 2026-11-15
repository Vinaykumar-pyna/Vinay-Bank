import { PaginatedResult } from './paginated-result';

describe('PaginatedResult', () => {
  it('computes page metadata', () => {
    const result = PaginatedResult.of(['a', 'b'], 45, 2, 20);
    expect(result.meta).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });

  it('reports a single empty page when there are no items', () => {
    const result = PaginatedResult.of([], 0, 1, 20);
    expect(result.meta).toMatchObject({ totalPages: 1, hasNext: false, hasPrev: false });
  });
});
