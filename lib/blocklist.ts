// The computer's distraction blocker. It only governs what the computer itself opens: a page
// can't block sites in the rest of the browser.

export const DEFAULT_BLOCKLIST = [
  'youtube.com', 'tiktok.com', 'instagram.com', 'x.com', 'reddit.com', 'facebook.com',
  'twitch.tv', 'netflix.com', 'discord.com', 'snapchat.com', 'pinterest.com',
];

// Other domains and names that mean the same site.
const ALIASES: Record<string, string[]> = {
  'x.com': ['twitter.com', 't.co', 'twitter'],
  'youtube.com': ['youtu.be'],
  'facebook.com': ['fb.com'],
  'discord.com': ['discord.gg'],
};

export function normalizeDomain(input: string): string | null {
  const host = input.trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

// Typed without a scheme, only these read as a website: `node.js` or `main.py` is a search.
const WEB_TLDS = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'io', 'dev', 'app', 'ai', 'co', 'me', 'tv', 'gg', 'info',
  'uk', 'us', 'ca', 'au', 'de', 'fr', 'jp', 'kr', 'in', 'nz', 'eu', 'xyz', 'site', 'blog', 'wiki',
]);

export type Target = { kind: 'url'; url: string; host: string } | { kind: 'search'; query: string };

export function parseTarget(input: string): Target | null {
  const text = input.trim();
  if (!text) return null;
  if (/^https?:\/\/\S+$/i.test(text)) {
    try {
      const url = new URL(text);
      return { kind: 'url', url: text, host: url.hostname.toLowerCase() };
    } catch {
      return { kind: 'search', query: text };
    }
  }
  const host = /\s/.test(text) ? null : normalizeDomain(text);
  if (host && (/^www\./i.test(text) || WEB_TLDS.has(host.split('.').pop()!))) {
    return { kind: 'url', url: `https://${text}`, host: text.toLowerCase().replace(/[/?#:].*$/, '') };
  }
  return { kind: 'search', query: text };
}

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '');
const coversHost = (domain: string, host: string) => host === domain || host.endsWith(`.${domain}`);
// 'youtube.com' -> 'youtube'. Names under 3 letters ('x') would block ordinary words.
const nameOf = (domain: string) => domain.split('.').slice(0, -1).join('.');

export function blockedBy(target: Target, list: string[]): string | null {
  for (const listed of list) {
    const domain = normalizeDomain(listed);
    if (!domain) continue;
    const aliases = ALIASES[domain] ?? [];
    const domains = [domain, ...aliases.filter((a) => a.includes('.'))];
    const names = [nameOf(domain), ...aliases.filter((a) => !a.includes('.'))].filter((n) => n.length >= 3);
    if (target.kind === 'url') {
      if (domains.some((d) => coversHost(d, bare(target.host)))) return domain;
      continue;
    }
    for (const word of target.query.toLowerCase().split(/[^\p{L}\p{N}.-]+/u)) {
      const w = word.replace(/^[.-]+|[.-]+$/g, '');
      if (!w) continue;
      const asDomain = normalizeDomain(w);
      if (asDomain && domains.some((d) => coversHost(d, asDomain))) return domain;
      if (names.includes(w)) return domain;
    }
  }
  return null;
}

export type Engine = 'google' | 'wikipedia' | 'scholar';
export const ENGINES: Record<Engine, { name: string; home: string; search: (q: string) => string }> = {
  google: { name: 'Google', home: 'https://www.google.com', search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  wikipedia: { name: 'Wikipedia', home: 'https://en.wikipedia.org', search: (q) => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}` },
  scholar: { name: 'Scholar', home: 'https://scholar.google.com', search: (q) => `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}` },
};
