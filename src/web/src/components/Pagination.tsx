import { PAGE_SIZE_OPTIONS } from '@/lib/usePaginatedList';
import { Button, Select } from '@/components/ui';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  busy?: boolean;
  /** Plural noun for the paged items, used in the screen-reader label. */
  itemLabel?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/**
 * Page navigation for a message list.
 *
 * Renders nothing when everything already fits on one page, so small mailboxes
 * are not cluttered with controls that cannot do anything.
 */
export default function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  busy = false,
  itemLabel = 'items',
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  if (total <= PAGE_SIZE_OPTIONS[0] && totalPages <= 1) return null;

  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted sm:justify-start">
        <span>
          {first.toLocaleString()}&ndash;{last.toLocaleString()} of {total.toLocaleString()}
        </span>
        {/*
          `relative` is load-bearing: sr-only is position:absolute, and without a
          positioned ancestor its containing block is the initial containing
          block rather than this bar. It then escapes the scrolling <main>,
          lands at its static position deep in the document, and stretches the
          page to that height — leaving a tall blank area below the layout.
        */}
        <label className="relative flex items-center gap-2">
          <span className="sr-only">{itemLabel} per page</span>
          <Select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <Button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || busy}
          variant="secondary"
          size="sm"
        >
          Previous
        </Button>
        <span className="text-sm whitespace-nowrap text-fg-muted" aria-live="polite">
          Page {page.toLocaleString()} of {totalPages.toLocaleString()}
        </span>
        <Button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || busy}
          variant="secondary"
          size="sm"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
