import { useCallback, useEffect, useState, type ReactNode } from 'react';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/locales/en';
import {
  AlertIcon,
  Badge,
  Card,
  CheckCircleIcon,
  SignalIcon,
  Spinner,
  type Tone,
} from '@/components/ui';

interface ModemStatus {
  status: string;
}

interface ModemSignal {
  signal: number;
  quality: string;
}

/** Highest value AT+CSQ reports for a usable signal. */
const MAX_SIGNAL = 31;

const QUALITY_LABELS: Record<string, MessageKey> = {
  excellent: 'quality.excellent',
  good: 'quality.good',
  fair: 'quality.fair',
  poor: 'quality.poor',
  none: 'quality.none',
  unknown: 'quality.unknown',
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function qualityTone(quality: string): Tone {
  if (quality === 'excellent' || quality === 'good') return 'success';
  if (quality === 'fair') return 'warning';
  return 'danger';
}

const TONE_BAR: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  primary: 'bg-primary',
  accent: 'bg-primary',
  neutral: 'bg-border-strong',
};

export interface ModemHealth {
  status: ModemStatus | null;
  signal: ModemSignal | null;
  statusLoading: boolean;
  signalLoading: boolean;
  statusError: string;
  signalError: string;
  refreshing: boolean;
  refresh: () => void;
}

/** Loads the modem status and signal, with a refresh for both. */
export function useModemHealth(): ModemHealth {
  const { t } = useI18n();
  const [status, setStatus] = useState<ModemStatus | null>(null);
  const [signal, setSignal] = useState<ModemSignal | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [signalLoading, setSignalLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [signalError, setSignalError] = useState('');

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');
    try {
      const response = await api.get<ModemStatus>('/modem/status');
      setStatus(response.data);
    } catch {
      setStatusError(t('modem.statusFailed'));
    } finally {
      setStatusLoading(false);
    }
  }, [t]);

  const fetchSignal = useCallback(async () => {
    setSignalLoading(true);
    setSignalError('');
    try {
      const response = await api.get<ModemSignal>('/modem/signal');
      setSignal(response.data);
    } catch {
      setSignalError(t('modem.signalFailed'));
    } finally {
      setSignalLoading(false);
    }
  }, [t]);

  const refresh = useCallback(() => {
    fetchStatus();
    fetchSignal();
  }, [fetchStatus, fetchSignal]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    status,
    signal,
    statusLoading,
    signalLoading,
    statusError,
    signalError,
    refreshing: statusLoading || signalLoading,
    refresh,
  };
}

function SignalBars({ strength, tone }: { strength: number; tone: Tone }) {
  const { t } = useI18n();
  const bars = Math.min(4, Math.max(0, Math.round((strength / MAX_SIGNAL) * 4)));

  return (
    <div className="flex items-end gap-1" title={t('modem.signalTitle', { strength })}>
      {[1, 2, 3, 4].map((level) => (
        <div
          key={level}
          className={cn(
            'w-1.5 rounded-sm transition-colors',
            level <= bars ? TONE_BAR[tone] : 'bg-border-strong',
          )}
          style={{ height: `${level * 5 + 4}px` }}
        />
      ))}
    </div>
  );
}

/** One health tile: a tinted icon, a small label and the value. */
function HealthTile({
  icon,
  iconClass,
  label,
  loading,
  error,
  children,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
            loading ? 'bg-surface-muted text-fg-subtle' : iconClass,
          )}
        >
          {loading ? <Spinner className="h-5 w-5" /> : icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-fg-muted uppercase">{label}</p>
          <div className="mt-1">
            {loading ? (
              <p className="text-sm text-fg-muted">{t('common.loading')}</p>
            ) : error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Modem status and signal strength side by side, stacked on phones. */
export function ModemHealthCards({ health }: { health: ModemHealth }) {
  const { t } = useI18n();
  const { status, signal } = health;
  const connected = status?.status === 'ok';
  const tone = signal ? qualityTone(signal.quality) : 'neutral';
  const percent = signal
    ? Math.min(100, Math.max(0, Math.round((signal.signal / MAX_SIGNAL) * 100)))
    : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
      <HealthTile
        icon={
          connected ? <CheckCircleIcon className="h-6 w-6" /> : <AlertIcon className="h-6 w-6" />
        }
        iconClass={
          status
            ? connected
              ? 'bg-success-soft text-success'
              : 'bg-danger-soft text-danger'
            : 'bg-surface-muted text-fg-subtle'
        }
        label={t('modem.status')}
        loading={health.statusLoading}
        error={health.statusError}
      >
        {status ? (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {connected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              )}
              <span
                className={cn(
                  'relative inline-flex h-2.5 w-2.5 rounded-full',
                  connected ? 'bg-success' : 'bg-danger',
                )}
              />
            </span>
            <span className="text-lg font-semibold text-fg">
              {connected ? t('modem.connected') : t('modem.disconnected')}
            </span>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">{t('modem.noStatus')}</p>
        )}
      </HealthTile>

      <HealthTile
        icon={<SignalIcon className="h-6 w-6" />}
        iconClass={cn(
          tone === 'success' && 'bg-success-soft text-success',
          tone === 'warning' && 'bg-warning-soft text-warning',
          tone === 'danger' && 'bg-danger-soft text-danger',
          tone === 'neutral' && 'bg-surface-muted text-fg-subtle',
        )}
        label={t('modem.signal')}
        loading={health.signalLoading}
        error={health.signalError}
      >
        {signal ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-lg font-semibold text-fg">
                {signal.signal}
                <span className="ml-1 text-sm font-normal text-fg-subtle">/ {MAX_SIGNAL}</span>
              </span>
              <SignalBars strength={signal.signal} tone={tone} />
              <Badge tone={tone}>
                {capitalize(
                  QUALITY_LABELS[signal.quality]
                    ? t(QUALITY_LABELS[signal.quality]!)
                    : signal.quality,
                )}
              </Badge>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
              <div
                className={cn('h-full rounded-full transition-all', TONE_BAR[tone])}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">{t('modem.noSignal')}</p>
        )}
      </HealthTile>
    </div>
  );
}
