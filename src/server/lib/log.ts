// Friendly, human-readable activity log for end users running `npx friend-in-md`.
// Distinct from Fastify's raw pino request logger, which is opt-in via
// --verbose for debugging and far too noisy for everyday use.
export function log(message: string): void {
  console.log(message);
}
