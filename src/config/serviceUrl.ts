import {NativeModules, Platform} from 'react-native';

type ServiceUrlOptions = {
  envKeys: string[];
  port: number;
  path?: string;
};

type ReachableServiceUrlOptions = ServiceUrlOptions & {
  healthPath?: string;
  timeoutMs?: number;
};

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const readEnvValue = (keys: string[]): string | undefined => {
  if (typeof process === 'undefined') {
    return undefined;
  }

  const env = (process as any)?.env;
  for (const key of keys) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim()) {
      return trimTrailingSlashes(value.trim());
    }
  }

  return undefined;
};

const getBundleHost = (): string | undefined => {
  const sourceCode = NativeModules.SourceCode as
    | {scriptURL?: string; bundleURL?: string}
    | undefined;
  const scriptUrl = sourceCode?.scriptURL || sourceCode?.bundleURL;

  if (!scriptUrl) {
    return undefined;
  }

  try {
    return new URL(scriptUrl).hostname;
  } catch {
    return undefined;
  }
};

const getFallbackHost = (): string =>
  Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

const normalizePath = (value: string): string =>
  value.startsWith('/') ? value : `/${value}`;

const buildServiceUrl = (host: string, port: number, path: string): string =>
  `http://${host}:${port}${normalizePath(path)}`;

const resolveHostFromEnvUrl = (envUrl: string): string | undefined => {
  try {
    return new URL(envUrl).hostname;
  } catch {
    return undefined;
  }
};

const resolveRuntimeHost = (envUrl?: string): string => {
  const envHost = envUrl ? resolveHostFromEnvUrl(envUrl) : undefined;
  const bundleHost = getBundleHost();

  if (!envHost) {
    return bundleHost || getFallbackHost();
  }

  if (envHost === 'localhost' || envHost === '127.0.0.1') {
    return bundleHost || getFallbackHost();
  }

  return envHost;
};

const dedupe = (values: string[]): string[] => {
  const seen = new Set<string>();
  return values.filter(value => {
    const normalized = value.replace(/\/+$/, '');
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
};

const rewriteLocalUrl = (envUrl: string): string => {
  try {
    const url = new URL(envUrl) as URL & {hostname: string};
    const runtimeHost = resolveRuntimeHost(envUrl);

    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      url.hostname = runtimeHost;
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    return envUrl.replace(/\/+$/, '');
  }
};

const buildCandidates = ({envKeys, port, path = '/api'}: ServiceUrlOptions): string[] => {
  const envUrl = readEnvValue(envKeys);
  const host = resolveRuntimeHost(envUrl);
  const normalizedPath = normalizePath(path);
  const candidateUrls = [
    envUrl,
    envUrl ? rewriteLocalUrl(envUrl) : undefined,
    buildServiceUrl(host, port, normalizedPath),
    buildServiceUrl('10.0.2.2', port, normalizedPath),
    buildServiceUrl('localhost', port, normalizedPath),
  ].filter((value): value is string => Boolean(value));

  return dedupe(candidateUrls);
};

const isReachable = async (
  baseUrl: string,
  healthPath: string,
  timeoutMs: number,
): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${normalizePath(healthPath)}`, {
      method: 'GET',
      signal: controller.signal,
      headers: {Accept: 'application/json'},
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

export const resolveLocalServiceUrl = ({
  envKeys,
  port,
  path = '/api',
}: ServiceUrlOptions): string => {
  const envUrl = readEnvValue(envKeys);
  if (envUrl) {
    return rewriteLocalUrl(envUrl);
  }

  const host = resolveRuntimeHost();
  const normalizedPath = normalizePath(path);

  return `http://${host}:${port}${normalizedPath}`;
};

export const resolveReachableServiceUrl = async ({
  envKeys,
  port,
  path = '/api',
  healthPath = '/health',
  timeoutMs = 1500,
}: ReachableServiceUrlOptions): Promise<string> => {
  const candidates = buildCandidates({envKeys, port, path});

  for (const candidate of candidates) {
    if (await isReachable(candidate, healthPath, timeoutMs)) {
      return candidate;
    }
  }

  return candidates[0] || buildServiceUrl(resolveRuntimeHost(), port, path);
};