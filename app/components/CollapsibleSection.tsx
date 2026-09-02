'use client';

import { useState } from 'react';
import { useAppTheme } from '../context/ThemeContext';

type Props = {
  title: string;
  subtitle?: string;
  defaultExpanded?: boolean;
  highlight?: boolean;
  children: React.ReactNode;
};

export default function CollapsibleSection({
  title,
  subtitle,
  defaultExpanded = false,
  highlight = false,
  children,
}: Props) {
  const { colorScheme } = useAppTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const light = colorScheme === 'light';

  return (
    <div className={`pierron-collapsible${light ? ' pierron-collapsible-light' : ''}`}>
      <button type="button" className="pierron-collapsible-header" onClick={() => setExpanded((v) => !v)}>
        <div className="pierron-collapsible-header-text">
          <span className={`pierron-collapsible-title${highlight ? ' pierron-collapsible-title-highlight' : ''}`}>
            {title}
          </span>
          {subtitle ? <span className="pierron-collapsible-subtitle">{subtitle}</span> : null}
        </div>
        <span className="pierron-collapsible-chevron" aria-hidden>
          {expanded ? '▲' : '▼'}
        </span>
      </button>
      {expanded ? <div className="pierron-collapsible-body">{children}</div> : null}
    </div>
  );
}
