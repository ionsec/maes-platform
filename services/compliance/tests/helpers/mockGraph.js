/**
 * Minimal Microsoft Graph client double.
 *
 * Routes are matched by exact path first, then by regular expression, so tests
 * can register both '/domains' and /^\/groups\/.*\/members$/.
 */
function createMockGraphClient(routes = {}) {
  const exact = new Map();
  const patterns = [];

  for (const [key, value] of Object.entries(routes)) {
    exact.set(key, value);
  }

  const resolve = (path) => {
    if (exact.has(path)) return exact.get(path);
    for (const [pattern, value] of patterns) {
      if (pattern.test(path)) return value;
    }
    return undefined;
  };

  const client = {
    calls: [],

    /** Register a regex-matched route after construction. */
    route(pattern, value) {
      patterns.push([pattern, value]);
      return client;
    },

    api(path) {
      client.calls.push(path);
      const chain = {
        select: () => chain,
        filter: () => chain,
        orderby: () => chain,
        top: () => chain,
        headers: () => chain,
        get: async () => {
          const value = resolve(path);
          if (value === undefined) {
            const error = new Error(`No mock route for ${path}`);
            error.statusCode = 404;
            throw error;
          }
          if (typeof value === 'function') return value(path);
          return value;
        }
      };
      return chain;
    },

    /** Mirrors the helper GraphClientService attaches to real clients. */
    async getAllPages(path) {
      client.calls.push(path);
      const value = resolve(path);
      if (value === undefined) {
        const error = new Error(`No mock route for ${path}`);
        error.statusCode = 404;
        throw error;
      }
      const resolved = typeof value === 'function' ? await value(path) : value;
      if (Array.isArray(resolved)) return resolved;
      return resolved.value || [];
    }
  };

  return client;
}

module.exports = { createMockGraphClient };
