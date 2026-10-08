import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { cn } from '@/lib/cn';
import ATConsole from '@/components/at/ATConsole';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  RefreshIcon,
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

function SignalBars({ strength }: { strength: number }) {
  // Normalize strength to 0-4 bars (signal_strength is typically 0-31 for GSM)
  const bars = Math.min(4, Math.max(0, Math.round((strength / 31) * 4)));

  return (
    <div className="flex items-end gap-1" title={`Signal: ${strength}/31`}>
      {[1, 2, 3, 4].map((level) => (
        <div
          key={level}
          className={cn(
            'w-2 rounded-sm transition-colors',
            level <= bars ? 'bg-success' : 'bg-border-strong',
          )}
          style={{ height: `${level * 6 + 4}px` }}
        />
      ))}
    </div>
  );
}

function qualityTone(quality: string): Tone {
  if (quality === 'excellent' || quality === 'good') return 'success';
  if (quality === 'fair') return 'warning';
  return 'danger';
}

function PanelState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <Spinner className="h-4 w-4" /> Loading...
      </p>
    );
  }
  if (error) return <p className="text-sm text-danger">{error}</p>;
  return <>{children}</>;
}

export default function ModemTest() {
  const { user } = useAuth();
  const isAdmin = user?.is_admin ?? false;

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
      const response = await api.get('/modem/status');
      setStatus(response.data);
    } catch {
      setStatusError('Failed to fetch modem status.');
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const fetchSignal = useCallback(async () => {
    setSignalLoading(true);
    setSignalError('');
    try {
      const response = await api.get('/modem/signal');
      setSignal(response.data);
    } catch {
      setSignalError('Failed to fetch signal information.');
    } finally {
      setSignalLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchSignal();
  }, [fetchStatus, fetchSignal]);

  const handleRefresh = () => {
    fetchStatus();
    fetchSignal();
  };

  const refreshing = statusLoading || signalLoading;
  const connected = status?.status === 'ok';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modem Test"
        description="Test modem connectivity and AT commands."
        actions={
          <Button
            variant="secondary"
            onClick={handleRefresh}
            loading={refreshing}
            icon={<RefreshIcon className="h-4 w-4" />}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      />

      {/* Status and Signal cards */}
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
        <Card>
          <CardHeader title="Modem Status" />
          <CardBody>
            <PanelState loading={statusLoading} error={statusError}>
              {status ? (
                <div className="flex items-center gap-3">
                  <span
                    className={cn('h-3 w-3 rounded-full', connected ? 'bg-success' : 'bg-danger')}
                  />
                  <span className="text-lg font-semibold text-fg">
                    {connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-fg-muted">No status data available.</p>
              )}
            </PanelState>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Signal Strength" />
          <CardBody>
            <PanelState loading={signalLoading} error={signalError}>
              {signal ? (
                <div className="flex flex-wrap items-center gap-4">
                  <SignalBars strength={signal.signal} />
                  <span className="text-2xl font-semibold text-fg">
                    {signal.signal}
                    <span className="ml-1 text-sm font-normal text-fg-subtle">/ 31</span>
                  </span>
                  <Badge tone={qualityTone(signal.quality)} className="capitalize">
                    {signal.quality}
                  </Badge>
                </div>
              ) : (
                <p className="text-sm text-fg-muted">No signal data available.</p>
              )}
            </PanelState>
          </CardBody>
        </Card>
      </div>

      {/* Raw AT console - admin only, as is the endpoint behind it */}
      {isAdmin && <ATConsole />}
    </div>
  );
}
