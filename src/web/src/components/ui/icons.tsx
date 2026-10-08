import type { ComponentProps, ReactNode } from 'react';

type IconProps = ComponentProps<'svg'>;

/**
 * Outline icons drawn on a 24px grid with the current text color, so they
 * follow whatever color and size the caller's classes give them.
 */
function icon(paths: ReactNode) {
  return function Icon({ className = 'h-5 w-5', ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
        {...props}
      >
        {paths}
      </svg>
    );
  };
}

export const MenuIcon = icon(<path d="M4 6h16M4 12h16M4 18h16" />);
export const XIcon = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const DashboardIcon = icon(
  <>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </>,
);
export const SendIcon = icon(<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />);
export const InboxIcon = icon(
  <path d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />,
);
export const OutboxIcon = icon(
  <path d="M12 15V3M7 8l5-5 5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />,
);
export const KeyIcon = icon(
  <>
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" />
  </>,
);
export const WebhookIcon = icon(<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />);
export const UsersIcon = icon(
  <>
    <circle cx="9" cy="7" r="4" />
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </>,
);
export const SignalIcon = icon(<path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16" />);
export const LogoutIcon = icon(
  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
);
export const TrashIcon = icon(
  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />,
);
export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />);
export const ArrowLeftIcon = icon(<path d="M19 12H5M12 19l-7-7 7-7" />);
export const RefreshIcon = icon(<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5" />);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>,
);
export const CheckIcon = icon(<path d="M20 6 9 17l-5-5" />);
export const EyeIcon = icon(
  <>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const PencilIcon = icon(<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />);
export const MessageIcon = icon(
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
);
export const TerminalIcon = icon(<path d="m4 17 6-6-6-6M12 19h8" />);
export const AlertIcon = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </>,
);
export const CheckCircleIcon = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </>,
);
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </>,
);
export const SunIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </>,
);
export const MoonIcon = icon(<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />);
export const MonitorIcon = icon(
  <>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </>,
);
export const SidebarIcon = icon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
  </>,
);
