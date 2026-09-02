'use client';

type LocaleFlagProps = {
  countryCode: string;
  /** Flag height in CSS pixels (width follows 4:3). */
  size?: number;
  className?: string;
  title?: string;
};

/**
 * Image flags — Linux (and some browsers) render regional-indicator emoji as
 * bare letters like "PL" / "BG" instead of flag glyphs.
 */
export default function LocaleFlag({
  countryCode,
  size = 18,
  className = 'pierron-locale-flag',
  title,
}: LocaleFlagProps) {
  const cc = countryCode.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) {
    return (
      <span className={className} aria-hidden>
        🌐
      </span>
    );
  }
  const height = size;
  const width = Math.round((size * 4) / 3);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small CDN flag; avoid next/image remote config
    <img
      className={className}
      src={`https://flagcdn.com/w40/${cc}.png`}
      srcSet={`https://flagcdn.com/w80/${cc}.png 2x`}
      width={width}
      height={height}
      alt=""
      title={title}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  );
}
