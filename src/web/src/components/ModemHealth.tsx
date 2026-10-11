import { useCallback, useEffect, useState, type ReactNode } from 'react';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/locales/en';
import { copyToClipboard } from '@/lib/clipboard';
import {
  AlertIcon,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CheckCircleIcon,
  GlobeIcon,
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

/** Modem and SIM identity; a field is empty when it cannot be read. */
export interface ModemInfo {
  /** Service provider name stored on the SIM, e.g. the MVNO brand. */
  provider: string;
  /** Network the modem is registered on. */
  network: string;
  phone_number: string;
  iccid: string;
  imsi: string;
  imei: string;
  manufacturer: string;
  model: string;
  firmware: string;
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
  /** Whether modem and SIM details were requested (they are admin only). */
  withInfo: boolean;
  info: ModemInfo | null;
  statusLoading: boolean;
  signalLoading: boolean;
  infoLoading: boolean;
  statusError: string;
  signalError: string;
  infoError: string;
  refreshing: boolean;
  /** Reloads everything, reading the modem and SIM details from the modem again. */
  refresh: () => void;
}

/**
 * Loads the modem status and signal, plus the modem and SIM details when
 * withInfo is set, with one refresh for all of them.
 */
export function useModemHealth({ withInfo = false }: { withInfo?: boolean } = {}): ModemHealth {
  const { t } = useI18n();
  const [status, setStatus] = useState<ModemStatus | null>(null);
  const [signal, setSignal] = useState<ModemSignal | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [signalLoading, setSignalLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [signalError, setSignalError] = useState('');
  const [info, setInfo] = useState<ModemInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(withInfo);
  const [infoError, setInfoError] = useState('');

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

  // The server caches the details until it restarts; refresh reads them
  // from the modem again.
  const fetchInfo = useCallback(async (refresh: boolean) => {
    setInfoLoading(true);
    setInfoError('');
    try {
      const response = await api.get<ModemInfo>('/modem/info', {
        params: refresh ? { refresh: true } : undefined,
      });
      setInfo(response.data);
    } catch {
      setInfoError(t('modem.infoFailed'));
    } finally {
      setInfoLoading(false);
    }
  }, [t]);

  const load = useCallback(
    (refreshInfo: boolean) => {
      fetchStatus();
      fetchSignal();
      if (withInfo) fetchInfo(refreshInfo);
    },
    [fetchStatus, fetchSignal, fetchInfo, withInfo],
  );

  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    load(false);
  }, [load]);

  return {
    status,
    signal,
    withInfo,
    info,
    statusLoading,
    signalLoading,
    infoLoading,
    statusError,
    signalError,
    infoError,
    refreshing: statusLoading || signalLoading || infoLoading,
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
  className,
  children,
}: {
  className?: string;
  icon: ReactNode;
  iconClass: string;
  label: string;
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
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

/**
 * Modem status and signal strength, plus the line provider when details were
 * requested; stacked on phones.
 */
export function ModemHealthCards({ health }: { health: ModemHealth }) {
  const { t } = useI18n();
  const { status, signal, info } = health;
  // An MVNO's SIM names the brand while the modem registers on the host
  // network; show the brand first and the network beneath it.
  const providerName = info?.provider || info?.network || '';
  const hostNetwork =
    info?.provider && info.network && info.network !== info.provider ? info.network : '';
  const connected = status?.status === 'ok';
  const tone = signal ? qualityTone(signal.quality) : 'neutral';
  const percent = signal
    ? Math.min(100, Math.max(0, Math.round((signal.signal / MAX_SIGNAL) * 100)))
    : 0;

  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 sm:gap-6', health.withInfo && 'xl:grid-cols-3')}>
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

      {health.withInfo && (
        <HealthTile
          className="sm:col-span-2 xl:col-span-1"
          icon={<GlobeIcon className="h-6 w-6" />}
          iconClass={
            providerName ? 'bg-primary-soft text-primary' : 'bg-surface-muted text-fg-subtle'
          }
          label={t('modem.carrier')}
          loading={health.infoLoading}
          error={health.infoError}
        >
          {providerName ? (
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-fg" title={providerName}>
                {providerName}
              </p>
              {hostNetwork && (
                <p className="truncate text-xs text-fg-muted">
                  {t('modem.carrierNetwork', { name: hostNetwork })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-fg-muted">{t('modem.carrierUnknown')}</p>
          )}
        </HealthTile>
      )}
    </div>
  );
}

const INFO_FIELDS: { key: keyof ModemInfo; label: MessageKey; copy?: boolean }[] = [
  { key: 'phone_number', label: 'modem.info.phoneNumber', copy: true },
  { key: 'provider', label: 'modem.info.provider' },
  { key: 'network', label: 'modem.info.network' },
  { key: 'iccid', label: 'modem.info.iccid', copy: true },
  { key: 'imsi', label: 'modem.info.imsi', copy: true },
  { key: 'imei', label: 'modem.info.imei', copy: true },
  { key: 'manufacturer', label: 'modem.info.manufacturer' },
  { key: 'model', label: 'modem.info.model' },
  { key: 'firmware', label: 'modem.info.firmware' },
];

/** Every modem and SIM detail as a label/value grid, with copy buttons for IDs. */
export function ModemInfoCard({ health }: { health: ModemHealth }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<keyof ModemInfo | null>(null);

  const handleCopy = async (key: keyof ModemInfo, value: string) => {
    try {
      await copyToClipboard(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Copying is a convenience; the value stays selectable.
    }
  };

  return (
    <Card>
      <CardHeader title={t('modem.info.title')} description={t('modem.info.description')} />
      <CardBody>
        {health.infoLoading && !health.info ? (
          <p className="flex items-center gap-2 text-sm text-fg-muted">
            <Spinner className="h-4 w-4" /> {t('common.loading')}
          </p>
        ) : health.infoError ? (
          <p className="text-sm text-danger">{health.infoError}</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {INFO_FIELDS.map(({ key, label, copy }) => {
              const value = health.info?.[key] ?? '';
              return (
                <div key={key} className="min-w-0">
                  <dt className="text-xs font-medium tracking-wide text-fg-muted uppercase">
                    {t(label)}
                  </dt>
                  <dd className="mt-1 flex items-center gap-2">
                    {value ? (
                      <>
                        <span className={cn('text-sm break-all text-fg', copy && 'font-mono')}>
                          {value}
                        </span>
                        {copy && (
                          <Button variant="link" onClick={() => handleCopy(key, value)}>
                            {copied === key ? t('common.copied') : t('common.copy')}
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-fg-subtle">{t('modem.info.unavailable')}</span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </CardBody>
    </Card>
  );
}
