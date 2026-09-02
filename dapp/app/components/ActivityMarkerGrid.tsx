'use client';

import type { EpochMarker } from '../../../shared/pierron/ecosystemCycle.ts';
import {
  isLotteryDrawEpochMarker,
  LOTTERY_DRAW_INTERVAL_EPOCHS,
  REDISTRIBUTION_CYCLE_EPOCHS,
} from '../../../shared/pierron/ecosystemCycle.ts';
import { useAppTheme } from '../context/ThemeContext';
import { useTranslations } from '../context/LocaleContext';

type Props = {
  markers: EpochMarker[];
  mini?: boolean;
};

function buildPlaceholderMarkers(cycleLength: number): EpochMarker[] {
  return Array.from({ length: cycleLength }, (_, index) => {
    const epochNumber = index + 1;
    return {
      key: `placeholder-${epochNumber}`,
      epochNumber,
      state: 'future' as const,
      isLotteryDrawEpoch: isLotteryDrawEpochMarker(epochNumber),
    };
  });
}

export default function ActivityMarkerGrid({ markers, mini = false }: Props) {
  const { colorScheme } = useAppTheme();
  const t = useTranslations();
  const light = colorScheme === 'light';
  const cycleLength = markers.length || REDISTRIBUTION_CYCLE_EPOCHS;
  const displayMarkers =
    markers.length > 0 ? markers : buildPlaceholderMarkers(REDISTRIBUTION_CYCLE_EPOCHS);
  const markersPerRow = LOTTERY_DRAW_INTERVAL_EPOCHS;
  const rowCount = Math.ceil(cycleLength / markersPerRow);
  const rows: EpochMarker[][] = Array.from({ length: rowCount }, (_, rowIdx) =>
    displayMarkers.slice(rowIdx * markersPerRow, (rowIdx + 1) * markersPerRow)
  );

  return (
    <div
      className={`pierron-marker-grid${mini ? ' pierron-marker-grid-mini' : ''}${markers.length === 0 ? ' pierron-marker-grid-loading' : ''}`}
      role="img"
      aria-label={t.ecosystem.currentActivityCycleTitle}
    >
      {rows.map((row, rowIdx) => (
        <div key={`marker-row-${rowIdx}`} className="pierron-marker-grid-row">
          {row.map((marker) => {
            const isActive = marker.state === 'active' || marker.state === 'current-active';
            const isInactive = marker.state === 'inactive' || marker.state === 'current-inactive';
            const isFuture = marker.state === 'future';
            const isCurrent =
              marker.state === 'current-active' || marker.state === 'current-inactive';
            const classes = [
              'pierron-marker',
              mini ? 'pierron-marker-mini' : '',
              isFuture ? 'pierron-marker-future' : '',
              isActive ? 'pierron-marker-active' : '',
              isInactive ? 'pierron-marker-inactive' : '',
              isCurrent ? 'pierron-marker-current' : '',
              marker.isLotteryDrawEpoch ? 'pierron-marker-lottery-draw' : '',
              light && isActive ? 'pierron-marker-active-light' : '',
              light && isInactive ? 'pierron-marker-inactive-light' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const aria =
              marker.isLotteryDrawEpoch
                ? t.ecosystem.activityEpochLotteryDraw
                : isActive
                  ? t.ecosystem.activityEpochActive
                  : isInactive
                    ? t.ecosystem.activityEpochInactive
                    : t.ecosystem.activityEpochFuture;

            // Concrete hex so SVG stroke always paints (same palette as mobile / CSS vars).
            const glyphColor = light
              ? '#ffffff'
              : isActive
                ? '#4ade80'
                : '#fca5a5';
            const glyphSize = mini ? 10 : 13;

            return (
              <div key={marker.key} className={classes} title={aria} aria-label={aria}>
                {isActive ? (
                  <svg
                    className="pierron-marker-glyph-svg"
                    width={glyphSize}
                    height={glyphSize}
                    viewBox="0 0 16 16"
                    aria-hidden
                  >
                    <path
                      d="M3.5 8.2 6.6 11.4 12.5 4.6"
                      fill="none"
                      stroke={glyphColor}
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
                {isInactive ? (
                  <svg
                    className="pierron-marker-glyph-svg"
                    width={glyphSize}
                    height={glyphSize}
                    viewBox="0 0 16 16"
                    aria-hidden
                  >
                    <path
                      d="M4 4 12 12M12 4 4 12"
                      fill="none"
                      stroke={glyphColor}
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
