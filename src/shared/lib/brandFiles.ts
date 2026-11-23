/* שני קובצי הלוגו שב-public והיחס (רוחב לגובה) של כל אחד, מה-viewBox שלו. הרכיב: shared/ui/BrandLogo */
export const BRAND_FILES = {
  full: { src: '/holoacademy-logo.svg', ratio: 168 / 204 },
  mark: { src: '/holoacademy-mark.svg', ratio: 1 },
} as const

/* מתחת לגובה הזה מציגים את האייקון ולא את הלוגו המלא */
export const FULL_LOGO_MIN_HEIGHT = 40

export type BrandLogoVariant = keyof typeof BRAND_FILES
