// Loads .env for tests that use the database (tests/integration). Unit tests don't need it.
// The LLM is always mocked in tests: `npm test` never calls the real API.
import { config } from "dotenv";
config({ quiet: true });
