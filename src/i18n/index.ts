import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { I18nManager } from 'react-native';
import { initReactI18next } from 'react-i18next';

import { type AppLocale, isRTL } from '@/contracts/i18n';

import ar from './locales/ar.json';
import en from './locales/en.json';

export const resources = {
  en: { translation: en },
  ar: { translation: ar },
} as const;

const deviceLanguage = getLocales()[0]?.languageCode ?? 'en';
const initialLocale: AppLocale = deviceLanguage === 'ar' ? 'ar' : 'en';

// Keep native layout direction in sync with the active locale.
// allowRTL must be enabled first; forceRTL fully applies after a reload on native.
I18nManager.allowRTL(true);
I18nManager.forceRTL(isRTL(initialLocale));

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: initialLocale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export default i18n;
export type { AppLocale };
