import { registerHooks } from 'node:module';

// Lets `node --test` load app modules: maps the `@/` path alias to the repo root and
// resolves extensionless imports to their .ts file, the way the Next bundler does.

const root = new URL('../', import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const target = specifier.startsWith('@/') ? new URL(specifier.slice(2), root).href : specifier;
    const local = target.startsWith('file:') || /^\.\.?\//.test(target);
    if (local && !/\.[cm]?[jt]sx?$/.test(target)) {
      try {
        return nextResolve(`${target}.ts`, context);
      } catch {
        // Not a .ts file — let the default resolver report it.
      }
    }
    return nextResolve(target, context);
  },
});
