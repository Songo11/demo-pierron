export type AppCluster = 'localnet' | 'devnet' | 'testnet' | 'mainnet-beta';

/** Języki mobilki (pl/en + rozszerzenia). */
export type AppLocale =
  | 'pl'
  | 'en'
  | 'de'
  | 'es'
  | 'pt'
  | 'ru'
  | 'zh'
  | 'ja'
  | 'cs'
  | 'sq'
  | 'sr'
  | 'fa'
  | 'vi'
  | 'ms'
  | 'ar'
  | 'ro'
  | 'fr'
  | 'sv'
  | 'fi'
  | 'hu'
  | 'el'
  | 'bg'
  | 'tr'
  | 'hr'
  | 'no'
  | 'ko'
  | 'sk'
  | 'lt'
  | 'be'
  | 'et'
  | 'md'
  | 'it'
  | 'sw'
  | 'ta'
  | 'ha'
  | 'th'
  | 'tl'
  | 'nl'
  | 'id'
  | 'sl'
  | 'so'
  | 'hi'
  | 'ur'
  | 'az'
  | 'is'
  | 'ka'
  | 'ku';

export type AppSettings = {
  cluster: AppCluster;
  /** Język interfejsu mobilki (domyślnie polski). */
  locale?: AppLocale;
  /** Motyw interfejsu: ciemny (złoto) lub jasny (biel + czerwień PL). */
  colorScheme?: 'dark' | 'light';
  slippage: string;
  usePrivacyMode: boolean;
  confirmBeforeAction: boolean;
  biometrics: boolean;
  stealthDefault: boolean;
  /** SPL mint (devnet bootstrap). Puste = domyślny z programIds. */
  stealthMintAddress?: string;
  /** Solana RPC override (localnet: LAN IP validatora z telefonu). */
  solanaRpcUrl?: string;
  /** Photon / indexer (Light). Localnet: http://<PC>:8784 */
  lightPhotonUrl?: string;
  /** Prover (Light). Localnet: http://<PC>:3001 */
  lightProverUrl?: string;
  /** Podkład muzyczny menu po podłączeniu portfela. */
  menuMusicEnabled?: boolean;
  /** Głośność podkładu (0–1). */
  menuMusicVolume?: number;
  /** Krótki dźwięk przy naciśnięciu przycisków. */
  clickSoundEnabled?: boolean;
};

export const STORAGE_KEYS = {
  settings: 'pierron_mobile_settings_v1',
  history: 'pierron_mobile_history_v1',
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  cluster: 'devnet',
  locale: 'pl',
  colorScheme: 'dark',
  slippage: '1.00',
  usePrivacyMode: false,
  confirmBeforeAction: true,
  biometrics: false,
  stealthDefault: false,
  stealthMintAddress: 'BYcQtZN9RbgRDyiRbBSr1UxgcEyWkyqqfmrumdKwLMri',
  solanaRpcUrl: '',
  lightPhotonUrl: '',
  lightProverUrl: '',
  menuMusicEnabled: true,
  menuMusicVolume: 0.5,
  clickSoundEnabled: true,
};
