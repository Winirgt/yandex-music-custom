import type { ElementKey, PlayerPosition, SidebarKey } from '../shared/types'

/**
 * ⚠️ Стартовые селекторы-примеры. Яндекс меняет разметку и хеширует классы.
 * Проверяйте через DevTools (F12 → Elements → Ctrl+F).
 * Широкие подстроки опасны: [class*="Banner"] цепляет WithTopBanner_* (обёртку
 * всего контента), [class*="Vibe"] — Content_main_newVibe. Поэтому тут узкие
 * составные селекторы.
 */
export const HIDE_SELECTORS: Record<ElementKey, string[]> = {
  ads: [
    '[class*="AdvertBanner" i]',
    '[class*="TopAdvert" i]',
    '[class*="SideAdvert" i]',
    '[class*="advert" i]',
    '[data-testid*="advert" i]',
    'a[href*="/promo"]',
    'a[href*="/adv"]'
  ],
  podcasts: [
    'a[href*="/podcasts"]',
    '[data-testid*="podcast" i]',
    '[class*="PodcastCard" i]',
    '[class*="Podcast_root" i]'
  ],
  subscribe: [
    '[class*="Subscribe" i]',
    '[class*="PlusButton" i]',
    '[data-testid*="plus" i]',
    'a[href*="/plus"]',
    'a[href*="/music-plus"]'
  ],
  social: [
    '[class*="SocialLinks" i]',
    '[class*="Social" i][class*="Icon" i]',
    'a[href*="vk.com"]',
    'a[href*="t.me"]',
    'a[href*="ok.ru"]'
  ],
  recommendations: [
    '[data-testid*="recommend" i]',
    '[class*="Recommendations_" i]',
    '[class*="Recommendation_" i]',
    '[aria-label*="рекоменд" i]',
    '[class*="Similar" i]'
  ],
  vibeFeed: [
    '[class*="WheelDesktop_root" i]',
    '[class*="Wheel_root" i]',
    '[class*="VibePage_root" i] [class*="swiper" i]'
  ],
  vibeHero: [
    '[class*="VibePage_meta" i]',
    '[class*="VibeBigCard" i]',
    '[class*="VibePage_hero" i]'
  ],
  vibeNews: [
    '[class*="VibePage_news" i]',
    '[class*="VibeNews" i]',
    '[class*="Announcement" i]',
    '[class*="NewsBanner" i]',
    '[class*="ticker" i]'
  ]
}

/** Вырезается всегда, без тумблера (баннер «Музыка на Windows» и fullscreen-промо Плюса). */
export const ALWAYS_HIDE_SELECTORS = [
  '[class*="DesktopBanner" i]',
  '[class*="DownloadBanner" i]',
  '[class*="WindowsPromo" i]',
  '[class*="DownloadApp" i]',
  '[class*="PlusPromo" i]',
  '[class*="Multipodpiska" i]',
  '[class*="MultiSubscription" i]',
  '[class*="PromoLanding" i]',
  '[class*="Paywall" i]',
  '[class*="TopAdvertBanner" i]',
  '[class*="SideAdvertBanner" i]',
  // Пункт «Ваш Плюс» в сайдбаре — функция вырезана полностью.
  '[class*="Navbar" i] a[href="/plus"]',
  // Встроенный «светящийся» эквалайзер Яндекса — используем свой.
  '[class*="Equalizer" i]',
  '[class*="equalizer" i]',
  '[data-test-id*="equalizer" i]',
  '[aria-label*="квалайзер" i]',
  // Визуализация самого Яндекса — используем свою.
  '[class*="Visualizer" i]:not(#ymod-visualizer)',
  '[class*="visualizer" i]:not(#ymod-visualizer)',
  '[class*="Waveform" i]',
  // ИИ-звёздочки внизу плеера.
  '[class*="AiBadge" i]'
]

export const ALWAYS_HIDE_TEXTS = ['Музыка на Windows', 'Все развлечения в одной']

export const HIDE_LABELS: Record<ElementKey, { title: string; hint: string }> = {
  ads: { title: 'Реклама и промо-баннеры', hint: 'Промо-блоки и рекламные ссылки' },
  podcasts: { title: 'Подкасты', hint: 'Пункты меню и блоки с подкастами' },
  subscribe: { title: 'Купить подписку / Плюс', hint: 'Кнопки подключения подписки' },
  social: { title: 'Соцкнопки', hint: 'Ссылки на VK, Telegram, OK' },
  recommendations: { title: 'Рекомендации', hint: 'Блоки «Вам может понравиться» и «Похожие»' },
  vibeFeed: { title: 'Лента «Моей волны»', hint: 'Список настроений, артистов и релизов слева' },
  vibeHero: { title: 'Герой «Моя волна»', hint: 'Большой заголовок, обложка и кнопки плеера' },
  vibeNews: { title: 'Анонсы / новости волны', hint: 'Строки-анонсы под плеером' }
}

export const HIDE_KEYS = Object.keys(HIDE_SELECTORS) as ElementKey[]

/** Категории левого сайдбара. ancestor — что прятать вместе с ссылкой (li пункта). */
export const SIDEBAR_RULES: Record<SidebarKey, { selectors: string[]; ancestor?: string; text?: string }> = {
  sidebarAll: { selectors: ['[class*="Navbar_root" i]'] },
  logo: { selectors: ['[class*="NavbarDesktop_logoWrapper" i]'] },
  search: { selectors: ['[class*="Navbar" i] a[href="/search"]'], ancestor: 'li' },
  wave: { selectors: [], text: 'Моя волна', ancestor: 'li' },
  foryou: { selectors: ['[class*="Navbar" i] a[href="/landing/main"]'], ancestor: 'li' },
  concerts: { selectors: ['[class*="Navbar" i] a[href="/concerts"]'], ancestor: 'li' },
  nonmusic: { selectors: ['[class*="Navbar" i] a[href="/non-music"]'], ancestor: 'li' },
  kids: { selectors: ['[class*="Navbar" i] a[href="/kids"]'], ancestor: 'li' },
  collection: { selectors: ['[class*="Navbar" i] a[href="/collection"]'], ancestor: 'li' },
  plus: { selectors: ['[class*="Navbar" i] a[href="/plus"]'], ancestor: 'li' },
  pins: { selectors: ['[class*="PinsList_root" i]'] }
}

export const SIDEBAR_LABELS: Record<SidebarKey, string> = {
  sidebarAll: 'Сайдбар целиком',
  logo: 'Логотип',
  search: 'Поиск',
  wave: 'Моя волна',
  foryou: 'Для вас и Тренды',
  concerts: 'Концерты',
  nonmusic: 'Книги и подкасты',
  kids: 'Детям',
  collection: 'Коллекция',
  plus: 'Ваш Плюс',
  pins: 'Закреплённые плейлисты'
}

export const SIDEBAR_KEYS = Object.keys(SIDEBAR_RULES) as SidebarKey[]

/** Глобальный плеер-бар и inline-плеер «Моей волны». */
export const PLAYER_SELECTORS = [
  '[class*="PlayerBar_root" i]',
  '[class*="VibePlayerBar_root" i]',
  '[class*="FullscreenPlayer_root" i]'
]

/** CSS для выбранной позиции плеера. Экспериментально: вёрстка Яндекса может отличаться. */
export function playerPositionCss(position: PlayerPosition): string {
  const sel = PLAYER_SELECTORS.join(',\n')
  switch (position) {
    case 'top':
      return `${sel} { top: 0 !important; bottom: auto !important; }`
    case 'left':
      return `${sel} {
        left: 0 !important; right: auto !important; top: 0 !important; bottom: 0 !important;
        width: 340px !important; height: auto !important;
        flex-direction: column !important; align-items: stretch !important;
      }`
    case 'right':
      return `${sel} {
        right: 0 !important; left: auto !important; top: 0 !important; bottom: 0 !important;
        width: 340px !important; height: auto !important;
        flex-direction: column !important; align-items: stretch !important;
      }`
    case 'hidden':
      return `${sel} { display: none !important; }`
    default:
      return ''
  }
}
