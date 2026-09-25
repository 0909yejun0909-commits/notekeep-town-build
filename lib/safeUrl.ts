import { defaultUrlTransform } from 'react-markdown';

// Notes can come from another player's vault, so only the reader's own blob:/wikilink:
// URLs and inline images skip react-markdown's scheme filter (which drops javascript: etc.).
export function safeUrl(url: string): string {
  if (url.startsWith('blob:') || url.startsWith('wikilink:') || /^data:image\//i.test(url)) return url;
  return defaultUrlTransform(url);
}
