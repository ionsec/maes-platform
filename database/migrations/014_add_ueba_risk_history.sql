-- Migration: Add UEBA risk history tracking
-- Description: Snapshot user risk scores over time so the UI can render risk-over-time trends and per-user drill-down.

CREATE TABLE IF NOT EXISTS maes.ueba_risk_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES maes.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES maes.organizations(id) ON DELETE CASCADE,
    risk_score INTEGER NOT NULL DEFAULT 0,
    confidence_level INTEGER NOT NULL DEFAULT 0,
    anomaly_count INTEGER NOT NULL DEFAULT 0,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ueba_risk_history_user_time
    ON maes.ueba_risk_history(user_id, organization_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_ueba_risk_history_org_time
    ON maes.ueba_risk_history(organization_id, recorded_at DESC);
