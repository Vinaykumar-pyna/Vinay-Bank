import { Pagination } from 'react-bootstrap';
import type { PaginationMeta } from '@/api/axiosBaseQuery';

interface PaginationBarProps {
  meta?: PaginationMeta;
  onPage: (page: number) => void;
}

/** Compact pager with a result summary; shows up to five page numbers around the current page. */
export function PaginationBar({ meta, onPage }: PaginationBarProps) {
  if (!meta || meta.total === 0) return null;
  const { page, totalPages, total, limit } = meta;
  const first = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => first + i);
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="d-flex flex-column flex-sm-row align-items-center justify-content-between gap-2 mt-3">
      <span className="small text-body-secondary">
        Showing {start}-{end} of {total}
      </span>
      {totalPages > 1 && (
        <Pagination size="sm" className="mb-0">
          <Pagination.Prev
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          />
          {pages.map((p) => (
            <Pagination.Item key={p} active={p === page} onClick={() => onPage(p)}>
              {p}
            </Pagination.Item>
          ))}
          <Pagination.Next
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
          />
        </Pagination>
      )}
    </div>
  );
}
