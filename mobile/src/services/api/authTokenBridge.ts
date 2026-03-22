export type ApiTokenGetter = () => Promise<string | null>;

let apiTokenGetter: ApiTokenGetter | null = null;

export function setApiTokenGetter(getter: ApiTokenGetter | null) {
  apiTokenGetter = getter;
}

export function getApiTokenGetter(): ApiTokenGetter | null {
  return apiTokenGetter;
}
