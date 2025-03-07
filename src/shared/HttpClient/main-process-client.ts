import { Axios } from 'axios';

import { onUserUnauthorized } from '../../main/auth/handlers';
import { getHeaders, getNewApiHeaders } from '../../main/auth/service';
import { AuthorizedHttpClient } from './HttpClient';

const headersProvider = () => Promise.resolve(getHeaders(false));
const newHeadersProvider = () => Promise.resolve(getNewApiHeaders());

let client: AuthorizedHttpClient | null = null;
let newClient: AuthorizedHttpClient | null = null;

export function getClient(): Axios {
  if (!client) {
    client = new AuthorizedHttpClient(headersProvider, onUserUnauthorized);
  }

  return client.client;
}

export function getNewTokenClient(): Axios {
  if (!newClient) {
    newClient = new AuthorizedHttpClient(
      newHeadersProvider,
      onUserUnauthorized
    );
  }

  return newClient.client;
}
