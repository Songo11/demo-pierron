'use client';

import { useLayoutMode, type DappLayoutMode } from '../context/LayoutModeContext';
import { useTranslations } from '../context/LocaleContext';

type Props = {
  compact?: boolean;
};

export default function LayoutModePicker({ compact = false }: Props) {
  const { layoutMode, setLayoutMode } = useLayoutMode();
  const t = useTranslations();

  const options: { id: DappLayoutMode; title: string; subtitle: string; icon: string }[] = [
    {
      id: 'phone',
      title: t.dapp.layoutPhoneTitle,
      subtitle: t.dapp.layoutPhoneSubtitle,
      icon: '📱',
    },
    {
      id: 'pc',
      title: t.dapp.layoutPcTitle,
      subtitle: t.dapp.layoutPcSubtitle,
      icon: '🖥️',
    },
  ];

  return (
    <div className={`pierron-layout-picker${compact ? ' pierron-layout-picker-compact' : ''}`}>
      {!compact ? (
        <>
          <p className="pierron-layout-picker-label">{t.dapp.layoutPickerTitle}</p>
          <p className="pierron-layout-picker-hint">{t.dapp.layoutPickerHint}</p>
        </>
      ) : null}
      <div className="pierron-layout-picker-row">
        {options.map(({ id, title, subtitle, icon }) => {
          const active = layoutMode === id;
          return (
            <button
              key={id}
              type="button"
              className={`pierron-layout-option${active ? ' pierron-layout-option-active' : ''}`}
              onClick={() => setLayoutMode(id)}
              aria-pressed={active}
            >
              <span className="pierron-layout-option-icon" aria-hidden>
                {icon}
              </span>
              <span className="pierron-layout-option-title">{title}</span>
              {!compact ? <span className="pierron-layout-option-subtitle">{subtitle}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
