import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import ATConsole from '@/components/at/ATConsole';
import { ModemHealthCards, useModemHealth } from '@/components/ModemHealth';
import { Button, PageHeader, RefreshIcon } from '@/components/ui';

export default function ModemTest() {
  const { user } = useAuth();
  const isAdmin = user?.is_admin ?? false;
  const { t } = useI18n();

  const health = useModemHealth();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.modemTest')}
        description={t('modem.description')}
        actions={
          <Button
            variant="secondary"
            onClick={health.refresh}
            loading={health.refreshing}
            icon={<RefreshIcon className="h-4 w-4" />}
          >
            {health.refreshing ? t('modem.refreshing') : t('modem.refresh')}
          </Button>
        }
      />

      <ModemHealthCards health={health} />

      {/* Raw AT console - admin only, as is the endpoint behind it */}
      {isAdmin && <ATConsole />}
    </div>
  );
}
