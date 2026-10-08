import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Small inline element beside the title, e.g. a record count. */
  meta?: ReactNode;
  actions?: ReactNode;
}

/** Page title row; actions drop below the title on phones. */
export function PageHeader({ title, description, meta, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          {meta && <span className="text-sm text-fg-muted">{meta}</span>}
        </div>
        {description && <p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
