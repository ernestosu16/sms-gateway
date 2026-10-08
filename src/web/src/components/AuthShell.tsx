import type { ReactNode } from 'react';
import LanguageControl from '@/components/LanguageControl';
import ThemeModeControl from '@/components/ThemeModeControl';
import { Card, MessageIcon } from '@/components/ui';

interface AuthShellProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/** Centered card layout for the screens shown before the main app. */
export default function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-app px-4 py-16">
      <div className="absolute top-4 right-4 flex flex-wrap justify-end gap-2">
        <LanguageControl />
        <ThemeModeControl />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-sm">
            <MessageIcon className="h-6 w-6" />
          </span>
          <span className="text-sm font-semibold tracking-wide text-fg-muted uppercase">
            SMS Gateway
          </span>
        </div>
        <Card className="p-6 sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
          {description && <div className="mt-1 text-sm text-fg-muted">{description}</div>}
          <div className="mt-6">{children}</div>
        </Card>
      </div>
    </div>
  );
}
