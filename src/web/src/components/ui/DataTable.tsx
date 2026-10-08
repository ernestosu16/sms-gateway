import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Where a column lands in the stacked card shown below the table breakpoint:
 * - title: bold first line (left)
 * - aside: first line, right-aligned (timestamps)
 * - body: full-width text under the title
 * - detail: labelled "Header  value" row (default)
 * - footer: full-width row at the bottom (row actions)
 * - hidden: desktop only
 */
export type MobileSlot = 'title' | 'aside' | 'body' | 'detail' | 'footer' | 'hidden';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Classes for this column's desktop cells, e.g. width or truncation. */
  className?: string;
  mobile?: MobileSlot;
}

interface Selection {
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  /** Accessible name for the select-all checkbox. */
  label: string;
}

interface DataTableProps<T extends { id: string }> {
  rows: T[];
  columns: Column<T>[];
  /** Makes whole rows activate on click and Enter. */
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | false | undefined;
  selection?: Selection;
  /** Dims the rows while a newer page is loading over them. */
  busy?: boolean;
  /** Width from which the real table replaces the cards; wide tables need more room. */
  breakpoint?: keyof typeof breakpoints;
}

// Literal class names so Tailwind's scanner can see them.
const breakpoints = {
  md: { table: 'hidden md:block', cards: 'md:hidden' },
  lg: { table: 'hidden lg:block', cards: 'lg:hidden' },
  xl: { table: 'hidden xl:block', cards: 'xl:hidden' },
} as const;

/**
 * A table on wide screens and a list of cards on phones, from one column
 * definition. Both are rendered and toggled with CSS so the layout never
 * depends on JavaScript measuring the viewport.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  onRowClick,
  rowClassName,
  selection,
  busy = false,
  breakpoint = 'md',
}: DataTableProps<T>) {
  const allSelected =
    selection !== undefined && rows.length > 0 && selection.selected.size === rows.length;

  const rowInteraction = (row: T) =>
    onRowClick
      ? {
          tabIndex: 0,
          onClick: () => onRowClick(row),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter') onRowClick(row);
          },
        }
      : {};

  const checkbox = (row: T) =>
    selection && (
      <input
        type="checkbox"
        checked={selection.selected.has(row.id)}
        onChange={() => selection.onToggle(row.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
    );

  const slot = (name: MobileSlot) => columns.filter((c) => (c.mobile ?? 'detail') === name);
  const titles = slot('title');
  const asides = slot('aside');
  const bodies = slot('body');
  const details = slot('detail');
  const footers = slot('footer');

  return (
    <div className={cn('transition-opacity', busy && 'opacity-60')}>
      {/* Desktop table */}
      <div className={cn('overflow-x-auto', breakpoints[breakpoint].table)}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface-muted">
            <tr>
              {selection && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={selection.onToggleAll}
                    aria-label={selection.label}
                    title={selection.label}
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    'px-4 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-fg-subtle uppercase',
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr
                key={row.id}
                {...rowInteraction(row)}
                className={cn(
                  'transition-colors hover:bg-surface-hover',
                  onRowClick &&
                    'cursor-pointer focus-visible:bg-surface-hover focus-visible:outline-none',
                  rowClassName?.(row),
                )}
              >
                {selection && (
                  <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {checkbox(row)}
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3 align-middle', col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className={breakpoints[breakpoint].cards}>
        {selection && (
          <label className="flex items-center gap-3 border-b border-border bg-surface-muted px-4 py-2.5 text-xs font-medium text-fg-muted">
            <input type="checkbox" checked={allSelected} onChange={selection.onToggleAll} />
            {selection.label}
          </label>
        )}
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.id}
              {...rowInteraction(row)}
              className={cn(
                'flex gap-3 px-4 py-3.5 transition-colors',
                onRowClick &&
                  'cursor-pointer active:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
                rowClassName?.(row),
              )}
            >
              {selection && <div className="pt-0.5">{checkbox(row)}</div>}
              <div className="min-w-0 flex-1">
                {(titles.length > 0 || asides.length > 0) && (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 font-medium text-fg">
                      {titles.map((col) => (
                        <span key={col.key} className="min-w-0 truncate">
                          {col.cell(row)}
                        </span>
                      ))}
                    </div>
                    <div className="shrink-0 text-xs text-fg-subtle">
                      {asides.map((col) => (
                        <span key={col.key}>{col.cell(row)}</span>
                      ))}
                    </div>
                  </div>
                )}
                {bodies.map((col) => (
                  <div key={col.key} className="mt-1 line-clamp-2 text-sm text-fg-muted">
                    {col.cell(row)}
                  </div>
                ))}
                {details.length > 0 && (
                  <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 text-sm">
                    {details.map((col) => (
                      <div key={col.key} className="contents">
                        <dt className="text-xs text-fg-subtle">{col.header}</dt>
                        <dd className="min-w-0 text-fg-muted">{col.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {footers.map((col) => (
                  <div key={col.key} className="mt-3">
                    {col.cell(row)}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
