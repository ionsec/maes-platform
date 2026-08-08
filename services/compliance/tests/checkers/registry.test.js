const { collectCheckers, CONTROL_ID_PATTERN } = require('../../src/services/checkers');

describe('checker registry', () => {
  const checkers = collectCheckers();

  // Keep this list in step with database/migrations/017_load_maes_entra_posture_controls.sql.
  const SEEDED_CONTROL_IDS = [
    'MAES-FED-01', 'MAES-FED-02', 'MAES-FED-03',
    'MAES-AUTH-01', 'MAES-AUTH-02',
    'MAES-MFA-01', 'MAES-MFA-02', 'MAES-MFA-03',
    'MAES-CA-01', 'MAES-CA-02',
    'MAES-SP-01', 'MAES-SP-02',
    'MAES-MAIL-01', 'MAES-MAIL-02', 'MAES-MAIL-03',
    'MAES-DNS-01'
  ];

  it('registers a checker for every seeded control', () => {
    for (const controlId of SEEDED_CONTROL_IDS) {
      expect(checkers.has(controlId)).toBe(true);
    }
  });

  it('registers no checker without a seeded control', () => {
    expect([...checkers.keys()].sort()).toEqual([...SEEDED_CONTROL_IDS].sort());
  });

  it('exposes every checker as a function', () => {
    for (const checker of checkers.values()) {
      expect(typeof checker).toBe('function');
    }
  });

  it('excludes exported test constants from the registry', () => {
    expect(CONTROL_ID_PATTERN.test('PHISHING_RESISTANT_METHODS')).toBe(false);
    expect(CONTROL_ID_PATTERN.test('MAES-FED-01')).toBe(true);
  });
});
