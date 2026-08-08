// scheduler.js destructures authorizeScan at require time, so the module has to
// be mocked (hoisted above the requires) rather than spied on afterwards.
// AuthorizationError stays real so instanceof checks in the scheduler still work.
jest.mock('../../src/recon/authorization', () => {
  const actual = jest.requireActual('../../src/recon/authorization');
  return { ...actual, authorizeScan: jest.fn() };
});

const scheduler = require('../../src/services/scheduler');
const authorization = require('../../src/recon/authorization');
const { AuthorizationError } = require('../../src/recon/authorization');

/**
 * Schedule double with the fields the recon branch reads, and an update()
 * that records what the scheduler wrote back.
 */
function fakeSchedule(overrides = {}) {
  const schedule = {
    id: 'sched-1',
    organization_id: 'org-1',
    name: 'Weekly exposure scan',
    schedule_kind: 'external_exposure',
    seed_domain: 'contoso.com',
    recon_profile: 'aggressive',
    frequency: 'weekly',
    parameters: {},
    is_active: true,
    updates: [],
    async update(values) {
      this.updates.push(values);
      Object.assign(this, values);
      return this;
    },
    ...overrides
  };
  return schedule;
}

function stubQueue() {
  const added = [];
  scheduler.reconQueue = {
    added,
    async add(name, data, opts) {
      added.push({ name, data, opts });
      return { id: 'job-1' };
    }
  };
  return added;
}

afterEach(() => {
  jest.clearAllMocks();
  scheduler.reconQueue = null;
  scheduler.scheduledJobs.clear();
});

describe('scheduled recon execution', () => {
  it('queues a scan when authorization still holds', async () => {
    authorization.authorizeScan.mockResolvedValue({ authorizationId: 'a1', basis: 'explicit_authorization' });
    const added = stubQueue();

    const schedule = fakeSchedule();
    await scheduler.executeScheduledReconScan(schedule);

    expect(added).toHaveLength(1);
    expect(added[0].data).toMatchObject({
      organizationId: 'org-1',
      seedDomain: 'contoso.com',
      profile: 'aggressive'
    });
    expect(added[0].data.options.isScheduled).toBe(true);
    expect(schedule.is_active).toBe(true);
  });

  it('re-checks authorization at fire time, not just at creation', async () => {
    authorization.authorizeScan.mockResolvedValue({ authorizationId: 'a1', basis: 'explicit_authorization' });
    stubQueue();

    await scheduler.executeScheduledReconScan(fakeSchedule());

    expect(authorization.authorizeScan).toHaveBeenCalledWith({
      organizationId: 'org-1',
      seedDomain: 'contoso.com',
      profile: 'aggressive'
    });
  });

  it('does not queue a scan once the authorization has lapsed', async () => {
    authorization.authorizeScan.mockRejectedValue(new AuthorizationError('authorization expired'));
    const added = stubQueue();

    await scheduler.executeScheduledReconScan(fakeSchedule());

    expect(added).toHaveLength(0);
  });

  it('deactivates the schedule rather than retrying nightly against a lapsed scope', async () => {
    authorization.authorizeScan.mockRejectedValue(new AuthorizationError('authorization expired'));
    stubQueue();

    const schedule = fakeSchedule();
    await scheduler.executeScheduledReconScan(schedule);

    expect(schedule.is_active).toBe(false);
    expect(schedule.parameters.deactivatedReason).toMatch(/authorization expired/);
    expect(schedule.parameters.deactivatedAt).toBeTruthy();
  });

  it('propagates non-authorization failures instead of silently disabling the schedule', async () => {
    authorization.authorizeScan.mockRejectedValue(new Error('database unreachable'));
    stubQueue();

    const schedule = fakeSchedule();
    await expect(scheduler.executeScheduledReconScan(schedule)).rejects.toThrow('database unreachable');
    expect(schedule.is_active).toBe(true);
  });

  it('does not retry a scan automatically, since each attempt is real outbound traffic', async () => {
    authorization.authorizeScan.mockResolvedValue({ authorizationId: 'a1', basis: 'explicit_authorization' });
    const added = stubQueue();

    await scheduler.executeScheduledReconScan(fakeSchedule());

    expect(added[0].opts.attempts).toBe(1);
  });

  it('carries a configured seed account through to the scan', async () => {
    authorization.authorizeScan.mockResolvedValue({ authorizationId: 'a1', basis: 'explicit_authorization' });
    const added = stubQueue();

    await scheduler.executeScheduledReconScan(
      fakeSchedule({ parameters: { seedUser: 'known@contoso.com' } })
    );

    expect(added[0].data.options.seedUser).toBe('known@contoso.com');
  });

  it('advances the next run time after a successful queue', async () => {
    authorization.authorizeScan.mockResolvedValue({ authorizationId: 'a1', basis: 'explicit_authorization' });
    stubQueue();

    const schedule = fakeSchedule();
    await scheduler.executeScheduledReconScan(schedule);

    expect(schedule.next_run_at).toBeInstanceOf(Date);
    expect(schedule.next_run_at.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('recon schedule creation', () => {
  it('rejects a recon schedule with no domain or profile', async () => {
    await expect(scheduler.createSchedule({
      organizationId: 'org-1',
      name: 'Bad schedule',
      frequency: 'weekly',
      scheduleKind: 'external_exposure'
    })).rejects.toThrow(/requires seedDomain and reconProfile/);
  });

  it('refuses to create a schedule the authorization gate would reject anyway', async () => {
    authorization.authorizeScan.mockRejectedValue(new AuthorizationError('not authorized'));

    await expect(scheduler.createSchedule({
      organizationId: 'org-1',
      name: 'Unauthorized schedule',
      frequency: 'weekly',
      scheduleKind: 'external_exposure',
      seedDomain: 'fabrikam.com',
      reconProfile: 'aggressive'
    })).rejects.toThrow(AuthorizationError);
  });
});
