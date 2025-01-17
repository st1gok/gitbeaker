import Got from 'got';
import { decamelizeKeys } from 'xcase';
import { Agent } from 'https';
import {
  DefaultRequestService,
  DefaultRequestReturn,
  DefaultRequestOptions,
  createInstance,
  defaultRequest as baseDefaultRequest,
  wait,
} from '@gitbeaker/requester-utils';

export function defaultRequest(
  service: DefaultRequestService,
  { body, query, sudo, method }: DefaultRequestOptions = {},
): DefaultRequestReturn & { json?: Record<string, unknown>; agent?: { https: Agent } } {
  const options: DefaultRequestReturn & {
    json?: Record<string, unknown>;
    agent?: { https: Agent };
  } = baseDefaultRequest(service, { body, query, sudo, method });

  // FIXME: Not the best comparison, but...it will have to do for now.
  if (typeof body === 'object' && body.constructor.name !== 'FormData') {
    options.json = decamelizeKeys(body);

    delete options.body;
  }

  if (service.url.includes('https')) {
    options.agent = {
      https: new Agent({
        rejectUnauthorized: service.rejectUnauthorized,
      }),
    };
  }

  return options;
}

export function processBody({
  rawBody,
  headers,
}: {
  rawBody: Buffer;
  headers: Record<string, unknown>;
}) {
  const contentType = headers['content-type'] || '';

  switch (contentType) {
    case 'application/json': {
      return rawBody.length === 0 ? {} : JSON.parse(rawBody.toString());
    }
    case 'application/octet-stream':
    case 'binary/octet-stream':
    case 'application/gzip': {
      return Buffer.from(rawBody);
    }
    default: {
      return rawBody.toString();
    }
  }
}

export async function handler(endpoint: string, options: Record<string, unknown>) {
  const obeyRateLimit = true;
  const maxRetries = 10;
  let response;

  for (let i = 0; i < maxRetries; i += 1) {
    const waitTime = 2 ** i * 0.1;
    try {
      if (options.method === 'stream') return Got(endpoint, options);
      response = await Got(endpoint, options); // eslint-disable-line
      break;
    } catch (e) {
      if (obeyRateLimit && e.response && e.response.statusCode === 429) {
        await wait(waitTime); // eslint-disable-line
        continue; // eslint-disable-line
      }

      if (e.response && typeof e.response.body === 'string' && e.response.body.length > 0) {
        const output = JSON.parse(e.response.body);

        e.description = output.error || output.message;
      }

      throw e;
    }
  }

  const { statusCode, headers } = response;

  const body = processBody(response);

  return { body, headers, status: statusCode };
}

export const Requester = createInstance(defaultRequest, handler);
