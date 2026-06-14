-- Magic-link login. Each email_tokens row now also carries a high-entropy link token
-- (stored hashed) so a one-tap sign-in link can ride alongside the manual 6-digit code.
-- The code stays for cross-device entry (read it off your phone, type it on the TV); the
-- link is the frictionless same-device path.
--
-- Additive + nullable, so the currently-live worker keeps serving until the new code ships:
-- old rows simply have a NULL link_token_hash and only the code path works for them.
ALTER TABLE email_tokens ADD COLUMN link_token_hash TEXT;

-- Sign-in links are resolved by hashing the URL token and looking the row up by this column.
CREATE INDEX idx_email_tokens_link ON email_tokens (link_token_hash);
