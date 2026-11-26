// Policy for files Claude writes inside factory products.
// evaluateFile() returns null (allowed) or {decision: 'deny', reason}.

const SECRET_BASENAME = /^\.env(\.[\w.-]+)?$/i;
const SECRET_OK = /\.(example|sample|template|defaults)$/i;
const SECRET_EXT = /\.(pem|key|p8|p12|pfx|jks|keystore|mobileprovision)$/i;

/**
 * @param {string} relPath  path relative to the project root, forward slashes
 * @param {{managed?: string[], factoryRepo?: string}} options
 */
export function evaluateFile(relPath, options = {}) {
  const rel = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const base = rel.split('/').pop() ?? rel;

  if ((SECRET_BASENAME.test(base) && !SECRET_OK.test(base)) || SECRET_EXT.test(base)) {
    return {
      decision: 'deny',
      reason: `"${rel}" holds secrets. Don't write it. Document new variables in .env.example and tell the human what to set.`,
    };
  }

  const managed = (options.managed ?? []).map((p) => p.replace(/\\/g, '/').toLowerCase());
  if (rel.toLowerCase() === '.factory/managed.json' || managed.includes(rel.toLowerCase())) {
    const where = options.factoryRepo ? ` (${options.factoryRepo})` : '';
    return {
      decision: 'deny',
      reason: `"${rel}" is managed by the software factory${where} and is overwritten on every sync. Change its template in the factory repo instead, or tell the human what should change.`,
    };
  }
  return null;
}
