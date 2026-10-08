import Mailbox from '@/components/Mailbox';
import { InboxIcon } from '@/components/ui';

const INBOX_PARAMS = { all: 'true' };

export default function Inbox() {
  return (
    <Mailbox
      title="Inbox"
      path="/sms/inbox"
      params={INBOX_PARAMS}
      phoneLabel="From"
      emptyIcon={<InboxIcon className="h-6 w-6" />}
      emptyText="Your inbox is empty."
      highlightUnread
    />
  );
}
