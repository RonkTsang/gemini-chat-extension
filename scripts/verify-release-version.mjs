export function verifyRelease(_config, { env, nextRelease, options }) {
  if (options.dryRun) return;

  if (nextRelease.version !== env.EXPECTED_VERSION) {
    throw new Error(`Refusing to publish ${nextRelease.version}: the packaged version is ${env.EXPECTED_VERSION ?? 'unset'}.`);
  }
}
