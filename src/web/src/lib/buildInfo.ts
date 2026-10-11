import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface HealthBuild {
  version: string;
  commit?: string;
}

let cached: Promise<string | null> | null = null;

/** Loads the running build once per page load from the public health check. */
function loadBuild(): Promise<string | null> {
  // A degraded gateway answers 503 but still reports its build.
  cached ??= api
    .get<HealthBuild>('/health', { validateStatus: () => true })
    .then(({ data }) =>
      data?.version ? (data.commit ? `${data.version} · ${data.commit}` : data.version) : null,
    )
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
