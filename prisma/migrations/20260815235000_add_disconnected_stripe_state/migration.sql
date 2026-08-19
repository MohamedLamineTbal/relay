-- A provider account can disappear independently of Relay when its owner
-- closes it or revokes the platform's access. Keep the historical connection
-- while removing it from the active payment path.
ALTER TYPE "StripeConnectionState" ADD VALUE 'DISCONNECTED';
