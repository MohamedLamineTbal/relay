import { jest } from '@jest/globals';
import { NextRequest } from '../frontend/node_modules/next/server.js';
import { PATCH } from '../frontend/src/app/api/backend/[...path]/route';

describe('Frontend backend proxy', () => {
  it('forwards customer PATCH requests through the same-origin route', async () => {
    const previousBackendUrl = process.env.BACKEND_API_URL;
    process.env.BACKEND_API_URL = 'https://backend.example.test';
    let forwardedRequest: Request | undefined;
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async (input: string | URL | Request, init?: RequestInit) => {
          forwardedRequest = new Request(input, init);
          return Response.json(
            { id: 42, name: 'Acme', email: 'billing@acme.test' },
            { status: 200 },
          );
        },
      );

    try {
      const response = await PATCH(
        new NextRequest(
          'https://app.example.test/api/backend/customers/42?notify=false',
          {
            method: 'PATCH',
            headers: {
              authorization: 'Bearer test-token',
              'content-type': 'application/json',
              'x-untrusted-header': 'must-not-be-forwarded',
            },
            body: JSON.stringify({ email: 'billing@acme.test' }),
          },
        ),
        { params: Promise.resolve({ path: ['customers', '42'] }) },
      );

      expect(forwardedRequest).toBeDefined();
      expect(forwardedRequest!.url).toBe(
        'https://backend.example.test/customers/42?notify=false',
      );
      expect(forwardedRequest!.method).toBe('PATCH');
      expect(forwardedRequest!.headers.get('authorization')).toBe(
        'Bearer test-token',
      );
      expect(forwardedRequest!.headers.get('content-type')).toBe(
        'application/json',
      );
      expect(forwardedRequest!.headers.get('x-untrusted-header')).toBeNull();
      await expect(forwardedRequest!.json()).resolves.toEqual({
        email: 'billing@acme.test',
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        id: 42,
        name: 'Acme',
        email: 'billing@acme.test',
      });
    } finally {
      fetchSpy.mockRestore();
      if (previousBackendUrl === undefined) delete process.env.BACKEND_API_URL;
      else process.env.BACKEND_API_URL = previousBackendUrl;
    }
  });
});
