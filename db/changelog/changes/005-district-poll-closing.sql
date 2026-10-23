--liquibase formatted sql

--changeset election:005-district-poll-closing
-- NULL = the poll is still open. The time is set once, when a commissioner closes the poll.
ALTER TABLE districts ADD COLUMN closed_at TIMESTAMPTZ;
--rollback ALTER TABLE districts DROP COLUMN closed_at;
