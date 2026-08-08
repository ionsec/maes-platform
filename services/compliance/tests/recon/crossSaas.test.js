const { CrossSaasPhase, compare } = require('../../src/recon/phases/crossSaas');

const response = (statusCode, reachable = true) => ({ reachable, statusCode });

describe('cross-SaaS existence differential', () => {
  it('treats a target that answers where the control does not resolve as existing', () => {
    expect(compare(response(200), response(null, false))).toBe('exists');
  });

  it('treats an unreachable target as absent', () => {
    expect(compare(response(null, false), response(200))).toBe('absent');
  });

  it('refuses to infer existence from a soft 404', () => {
    // The platform returns 200 for a slug that certainly does not exist,
    // so a 200 for the target says nothing.
    expect(compare(response(200), response(200))).toBe('inconclusive');
  });

  it('refuses to infer existence from a blanket sign-in redirect', () => {
    expect(compare(response(302), response(302))).toBe('inconclusive');
  });

  it('treats a definitive 404 as absent even when the control differs', () => {
    expect(compare(response(404), response(200))).toBe('absent');
  });

  it('treats a 200 against a non-200 control as existing', () => {
    expect(compare(response(200), response(404))).toBe('exists');
  });
});

describe('CrossSaasPhase', () => {
  function ctxWith(responder) {
    const issued = [];
    return {
      seedDomain: 'contoso.com',
      state: {},
      options: {},
      probeClient: {
        issued,
        async probe(url) {
          issued.push(url);
          return { url, ...responder(url) };
        }
      }
    };
  }

  it('probes a control slug alongside every target slug', async () => {
    const ctx = ctxWith(() => ({ reachable: true, statusCode: 404 }));
    const phase = new CrossSaasPhase(ctx);
    await phase.run();

    // One target and one control per platform.
    expect(ctx.probeClient.issued.length).toBe(16);
    expect(ctx.probeClient.issued.filter(u => u.includes('maes-absent-'))).toHaveLength(8);
  });

  it('emits nothing when every platform answers identically for a bogus slug', async () => {
    const ctx = ctxWith(() => ({ reachable: true, statusCode: 200 }));
    const phase = new CrossSaasPhase(ctx);
    await phase.run();

    expect(phase.findings).toHaveLength(0);
    expect(ctx.state.crossSaasInconclusive).toHaveLength(8);
  });

  it('emits only for platforms where the target genuinely differs', async () => {
    const ctx = ctxWith(url => (
      url.includes('maes-absent-')
        ? { reachable: true, statusCode: 404 }
        : { reachable: true, statusCode: url.includes('slack') ? 200 : 404 }
    ));

    const phase = new CrossSaasPhase(ctx);
    await phase.run();

    expect(phase.findings).toHaveLength(1);
    expect(phase.findings[0].title).toContain('Slack');
  });

  it('records the control response as evidence', async () => {
    const ctx = ctxWith(url => (
      url.includes('maes-absent-')
        ? { reachable: false, statusCode: null }
        : { reachable: true, statusCode: 200 }
    ));

    const phase = new CrossSaasPhase(ctx);
    await phase.run();

    expect(phase.findings[0].evidence.control).toMatchObject({ reachable: false });
    expect(phase.findings[0].evidence.method).toMatch(/control slug/);
  });
});
