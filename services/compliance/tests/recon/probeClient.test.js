const { ProbeClient, ProbeBudgetExceededError, DEFAULT_USER_AGENT } = require('../../src/recon/probeClient');

/** Collects the rows a ProbeClient would write to recon_probe_log. */
function fakeDb() {
  const rows = [];
  return {
    rows,
    async query(text, params) {
      if (/INSERT INTO maes\.recon_probe_log/.test(text)) {
        rows.push({
          scanId: params[0],
          phase: params[1],
          kind: params[2],
          method: params[3],
          url: params[4],
          host: params[5],
          statusCode: params[6],
          elapsedMs: params[7],
          error: params[8],
          userAgent: params[9]
        });
      }
      return { rows: [] };
    }
  };
}

function client(overrides = {}) {
  return new ProbeClient({
    scanId: 'scan-1',
    perHostMinIntervalMs: 0,
    jitterMs: 0,
    httpClient: async () => ({ status: 200, headers: {}, data: 'ok' }),
    ...overrides
  });
}

describe('ProbeClient construction', () => {
  it('refuses to be built without a scan id, so probes are always attributable', () => {
    expect(() => new ProbeClient({})).toThrow(/scanId/);
  });

  it('identifies itself honestly by default', () => {
    expect(DEFAULT_USER_AGENT).toMatch(/^MAES-/);
    expect(client().userAgent).toBe(DEFAULT_USER_AGENT);
  });
});

describe('probe budget', () => {
  it('throws once the ceiling is reached', async () => {
    const c = client({ maxProbes: 2 });

    await c.probe('https://a.example/1');
    await c.probe('https://a.example/2');

    await expect(c.probe('https://a.example/3')).rejects.toThrow(ProbeBudgetExceededError);
    expect(c.count).toBe(2);
  });

  it('cannot be overshot by concurrent callers', async () => {
    let inFlight = 0;
    const c = client({
      maxProbes: 3,
      maxConcurrency: 10,
      httpClient: async () => {
        inFlight++;
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight--;
        return { status: 200, headers: {}, data: 'ok' };
      }
    });

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => c.probe(`https://a.example/${i}`))
    );

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(3);
    expect(c.count).toBe(3);
    expect(inFlight).toBe(0);
  });

  it('probeAll returns what completed rather than failing the batch', async () => {
    const c = client({ maxProbes: 2 });
    const results = await c.probeAll([
      'https://a.example/1',
      'https://a.example/2',
      'https://a.example/3'
    ]);

    expect(results).toHaveLength(2);
  });
});

describe('concurrency cap', () => {
  it('never exceeds maxConcurrency simultaneous requests', async () => {
    let inFlight = 0;
    let peak = 0;

    const c = client({
      maxProbes: 100,
      maxConcurrency: 3,
      httpClient: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise(resolve => setTimeout(resolve, 5));
        inFlight--;
        return { status: 200, headers: {}, data: 'ok' };
      }
    });

    await Promise.all(Array.from({ length: 12 }, (_, i) => c.probe(`https://h${i}.example/`)));

    expect(peak).toBeLessThanOrEqual(3);
    expect(c.count).toBe(12);
  });
});

describe('per-host rate limiting', () => {
  it('spaces successive requests to the same host', async () => {
    const timestamps = [];
    const c = client({
      maxProbes: 10,
      maxConcurrency: 5,
      perHostMinIntervalMs: 40,
      jitterMs: 0,
      httpClient: async () => {
        timestamps.push(Date.now());
        return { status: 200, headers: {}, data: 'ok' };
      }
    });

    await Promise.all([
      c.probe('https://same.example/1'),
      c.probe('https://same.example/2'),
      c.probe('https://same.example/3')
    ]);

    timestamps.sort((a, b) => a - b);
    // Allow a little slack for timer resolution.
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(30);
    expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(30);
  });

  it('does not slow down requests to different hosts', async () => {
    const c = client({
      maxProbes: 10,
      maxConcurrency: 5,
      perHostMinIntervalMs: 200,
      jitterMs: 0
    });

    const started = Date.now();
    await Promise.all([
      c.probe('https://a.example/'),
      c.probe('https://b.example/'),
      c.probe('https://c.example/')
    ]);

    expect(Date.now() - started).toBeLessThan(150);
  });
});

describe('audit trail', () => {
  it('records every probe with its outcome', async () => {
    const db = fakeDb();
    const c = client({ db, maxProbes: 5 });

    await c.probe('https://a.example/path', { phase: 'tenant' });

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      scanId: 'scan-1',
      phase: 'tenant',
      kind: 'http',
      method: 'GET',
      url: 'https://a.example/path',
      host: 'a.example',
      statusCode: 200,
      error: null,
      userAgent: DEFAULT_USER_AGENT
    });
  });

  it('records failed probes too', async () => {
    const db = fakeDb();
    const c = client({
      db,
      httpClient: async () => {
        const error = new Error('connect ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        throw error;
      }
    });

    const result = await c.probe('https://down.example/');

    expect(result.reachable).toBe(false);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].error).toBe('ECONNREFUSED');
  });

  it('records DNS lookups alongside HTTP probes', async () => {
    const db = fakeDb();
    const c = client({ db });

    await c.logDnsLookup({ name: 'contoso.com', recordType: 'TXT', phase: 'dns_surface', elapsedMs: 5 });

    expect(db.rows[0]).toMatchObject({ kind: 'dns', method: 'TXT', url: 'contoso.com' });
  });

  it('does not abort a scan when the audit write fails', async () => {
    const c = client({
      db: { query: async () => { throw new Error('database is down'); } }
    });

    await expect(c.probe('https://a.example/')).resolves.toMatchObject({ reachable: true });
  });
});

describe('probe semantics', () => {
  it('treats any HTTP status as a result rather than an error', async () => {
    const c = client({ httpClient: async () => ({ status: 403, headers: {}, data: 'denied' }) });

    const result = await c.probe('https://a.example/');

    expect(result.reachable).toBe(true);
    expect(result.statusCode).toBe(403);
  });

  it('does not follow redirects or send credentials', async () => {
    let capturedConfig = null;
    const c = client({
      httpClient: async (config) => {
        capturedConfig = config;
        return { status: 200, headers: {}, data: 'ok' };
      }
    });

    await c.probe('https://a.example/');

    expect(capturedConfig.maxRedirects).toBe(0);
    expect(capturedConfig.withCredentials).toBe(false);
    expect(capturedConfig.headers['User-Agent']).toBe(DEFAULT_USER_AGENT);
  });
});
