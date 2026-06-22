// Manual mock for homebridge-lib.
// The real package pulls in hb-lib-tools → chalk (ESM with import maps)
// which Jest's CommonJS transform cannot handle. This thin stub keeps tests
// green while preserving the function's documented contract: return a
// human-readable string describing the error.
export function formatError(err) {
  return err && err.message ? err.message : String(err);
}
