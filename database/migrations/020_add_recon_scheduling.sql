-- Migration: Scheduling for external exposure scans
-- Description: Extends maes.compliance_schedules to carry recon scans as well as
--              compliance assessments, so both reuse one schedule lifecycle
--              (cron activation, the hourly sweep, next-run calculation, stats)
--              rather than duplicating it.

ALTER TABLE maes.compliance_schedules
    ADD COLUMN IF NOT EXISTS schedule_kind VARCHAR(20) NOT NULL DEFAULT 'compliance',
    ADD COLUMN IF NOT EXISTS seed_domain VARCHAR(253),
    ADD COLUMN IF NOT EXISTS recon_profile maes.recon_profile,
    ADD COLUMN IF NOT EXISTS last_scan_id UUID REFERENCES maes.recon_scans(id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'compliance_schedules_kind_check'
    ) THEN
        ALTER TABLE maes.compliance_schedules
            ADD CONSTRAINT compliance_schedules_kind_check
            CHECK (schedule_kind IN ('compliance', 'external_exposure'));
    END IF;

    -- A recon schedule is meaningless without a domain and a profile; enforce
    -- that here so a half-configured schedule cannot sit dormant until it fires.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'compliance_schedules_recon_fields_check'
    ) THEN
        ALTER TABLE maes.compliance_schedules
            ADD CONSTRAINT compliance_schedules_recon_fields_check
            CHECK (
                schedule_kind <> 'external_exposure'
                OR (seed_domain IS NOT NULL AND recon_profile IS NOT NULL)
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_compliance_schedules_kind
    ON maes.compliance_schedules(schedule_kind, is_active);
