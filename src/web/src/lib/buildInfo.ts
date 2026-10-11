import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface HealthBuild {
  version: string;
  commit?: string;
}

/** "version · commit", dropping the commit when the version already names it (git describe). */
function formatBuild({ version, commit }: HealthBuild): string {
  if (!commit || version.includes(commit.replace(/-dirty$/, ''))) return version;
  return `${version} · ${commit}`;
}

let cached: Promise<string | null> | null = null;

/** Loads the running build once per page load from the public health check. */
function loadBuild(): Promise<string | null> {
  // A degraded gateway answers 503 but still reports its build.
  cached ??= api
    .get<HealthBuild>('/health', { validateStatus: () => true })
    .then(({ data }) => (data?.version ? formatBuild(data) : null))
    .catch(() => {
      cached = null;
      return null;
    });
  return cached;
}

/**
 * The running build as "version · commit", so an operator can tell whether an
 * update landed. Null until loaded or when unavailable.
 */
export function useBuildInfo(): string | null {
  const [build, setBuild] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void loadBuild().then((b) => active && setBuild(b));
    return () => {
      active = false;
    };
  }, []);
  return build;
}
