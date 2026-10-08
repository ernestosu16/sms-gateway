import { Button } from './Button';

interface ConfirmInlineProps {
  prompt: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** In-place "Are you sure?" for destructive row actions. */
export function ConfirmInline({
  prompt,
  confirmLabel = 'Yes',
  onConfirm,
  onCancel,
}: ConfirmInlineProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-fg-muted">{prompt}</span>
      <Button size="sm" variant="danger" onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button size="sm" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
