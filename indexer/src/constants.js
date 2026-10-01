export const REGISTRY_ID = '0x297cb610c0c47edc1e12008812f28cd8a1f35f95bb406d45f4b76fa9fda2e04c';
export const DEFAULT_ENDPOINT = 'https://graphql.mainnet.sui.io/graphql';
export const SCHEMA_VERSION = 1;

export function sameAddress(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return a.toLowerCase().replace(/^0x0+/, '0x') === b.toLowerCase().replace(/^0x0+/, '0x');
}
