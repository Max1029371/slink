import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import { ApiConnector } from '@slink/api/ApiConnector';

import { Theme, setCookieSettingsOnLocals } from '@slink/lib/settings';

const handleWellKnownRequests: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  if (pathname.startsWith('/.well-known/')) {
    if (pathname.endsWith('.json')) {
      return json({});
    }

    return new Response('Not Found', { status: 404 });
  }

  return resolve(event);
};

const injectApiHandling: Handle = ApiConnector({
  urlPrefix: env.API_PREFIX,
  baseUrl: env.API_URL,
  registeredPaths: env.PROXY_PREFIXES.split(';'),
});

const filterResponseHeaders: Handle = async ({ event, resolve }) => {
  const headers = ['location', 'content-type'];
  return resolve(event, {
    filterSerializedResponseHeaders: (name) => {
      return name.startsWith('x-') || headers.includes(name);
    },
  });
};

const applyClientTheme: Handle = async ({ event, resolve }) => {
  const theme = event.cookies.get('settings.theme') || Theme.DARK;

  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('%app.theme%', theme),
  });
};

export const handle = sequence(
  handleWellKnownRequests,
  filterResponseHeaders,
  injectApiHandling,
  setCookieSettingsOnLocals,
  applyClientTheme,
);
