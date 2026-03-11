import { en } from './en';

const dictionaries = {
  en,
} as const;

type Dictionary = typeof en;
type RecursiveKeyOf<TObj extends object> = {
  [TKey in keyof TObj & string]: TObj[TKey] extends object
    ? `${TKey}.${RecursiveKeyOf<TObj[TKey]>}`
    : `${TKey}`;
}[keyof TObj & string];

type TranslationKey = RecursiveKeyOf<Dictionary>;

function resolveDictionary() {
  if (typeof navigator === 'undefined') {
    return dictionaries.en;
  }

  const language = navigator.language.toLowerCase();
  const locale = language.split('-')[0] as keyof typeof dictionaries;
  return dictionaries[locale] ?? dictionaries.en;
}

function getFromDictionary(dictionary: Dictionary, key: TranslationKey) {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[part];
  }, dictionary);
}

export function t(key: TranslationKey) {
  const activeDictionary = resolveDictionary();
  const activeValue = getFromDictionary(activeDictionary, key);
  if (typeof activeValue === 'string') {
    return activeValue;
  }

  const fallbackValue = getFromDictionary(dictionaries.en, key);
  if (typeof fallbackValue === 'string') {
    return fallbackValue;
  }

  return key;
}
