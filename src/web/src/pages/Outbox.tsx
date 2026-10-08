import Mailbox from '@/components/Mailbox';
import { OutboxIcon } from '@/components/ui';

export default function Outbox() {
  return (
    <Mailbox
      title="Outbox"
      path="/sms/outbox"
      phoneLabel="To"
      emptyIcon={<OutboxIcon className="h-6 w-6" />}
      emptyText="Your outbox is empty."
    />
  );
}
