-- Migration: Per-user alert read state
-- Description: The frontend has always shown an unread badge and offered
--              "mark as read", but no read state existed anywhere — the badge
--              could never clear and the PATCH calls behind those controls
--              404'd. This adds the missing state.
--
--              Read state is per user, not per alert: two analysts looking at
--              the same organization each have their own unread count. It is
--              also deliberately separate from `status`, which tracks triage
--              (new / acknowledged / investigating / resolved). Having read a
--              notification is not the same as having acknowledged an alert,
--              and conflating them would corrupt triage data.

CREATE TABLE IF NOT EXISTS maes.alert_reads (
    alert_id UUID NOT NULL REFERENCES maes.alerts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES maes.users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (alert_id, user_id)
);

-- The dominant query is "which of this user's alerts are unread", so the
-- user-first index carries the lookup.
CREATE INDEX IF NOT EXISTS idx_alert_reads_user ON maes.alert_reads(user_id);
