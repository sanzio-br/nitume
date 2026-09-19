const fs = require('fs');
const path = require('path');

const u = (raw, extra = {}) => ({
  raw,
  host: ['{{baseUrl}}'],
  path: raw.replace('{{baseUrl}}/', '').split('/'),
  ...extra,
});

const ACTING_HEADER = 'x-nitume-acting-role';

const bearer = (actingRole) =>
  [
    { key: 'Authorization', value: 'Bearer {{nitume_access_token}}' },
    ...(actingRole ? [{ key: ACTING_HEADER, value: actingRole }] : []),
  ];

const jsonBody = (raw) => ({
  mode: 'raw',
  raw,
  options: { raw: { language: 'json' } },
});

const req = (name, method, pathname, actingRole) => ({
  name,
  request: {
    method,
    header: bearer(actingRole),
    url: u(`{{baseUrl}}${pathname}`),
  },
  response: [],
});

const post = (name, pathname, raw, actingRole) => ({
  name,
  request: {
    method: 'POST',
    header: [...bearer(actingRole), { key: 'Content-Type', value: 'application/json' }],
    body: jsonBody(raw),
    url: u(`{{baseUrl}}${pathname}`),
  },
  response: [],
});

const patch = (name, pathname, raw, actingRole) => ({
  name,
  request: {
    method: 'PATCH',
    header: [...bearer(actingRole), { key: 'Content-Type', value: 'application/json' }],
    body: jsonBody(raw),
    url: u(`{{baseUrl}}${pathname}`),
  },
  response: [],
});

const folder = (name, item) => ({ name, item });

const collection = {
  info: {
    _postman_id: '2f1b9c3e-7a14-4c9d-9e6f-50b8e2c1a917',
    name: 'Nitume API (apps/api)',
    description:
      'Manual QA collection for the Nitume errands API (NestJS, apps/api, /api/v1 prefix on port 3000).\n\n' +
      'AUTH FLOW (folder 2_Auth):\n' +
      '1. POST /auth/otp/request { phone } — in dev transport the OTP code is PRINTED TO THE API CONSOLE (console transport, no SMS). Read it there and paste into the nitume_dev_code variable.\n' +
      '2. POST /auth/otp/verify { phone, code, role? } — response is { user, tokens }. The test script saves tokens.accessToken -> nitume_access_token and tokens.refreshToken -> nitume_refresh_token into the active environment.\n' +
      '3. POST /auth/refresh { refreshToken } to rotate, POST /auth/logout { refreshToken } to revoke.\n\n' +
      'ACTING-ROLE HEADER:\n' +
      'An account can act in more than one capacity (customer owns errands, runner services them, admin mediates). Send x-nitume-acting-role: customer|runner|admin on OTP verify and on every request to switch the active surface. Admin-gated routes (matching assign/quote, errands resolve-dispute, runners admin list/review) require an ADMIN account.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000/api/v1', type: 'string' },
    { key: 'nitume_access_token', value: '', type: 'string' },
    { key: 'nitume_refresh_token', value: '', type: 'string' },
    { key: 'nitume_dev_code', value: '', type: 'string' },
    { key: 'errand_id', value: '', type: 'string' },
    { key: 'runner_id', value: '', type: 'string' },
    { key: 'verification_id', value: '', type: 'string' },
  ],
  item: [
    folder('0_Health', [
      req('Health check', 'GET', '/health'),
    ]),
    folder('1_Auth', [
      {
        name: 'OTP Request (code -> console)',
        event: [
          {
            listen: 'test',
            script: {
              exec: [
                "pm.test('otp request returns 201 + message', () => {",
                "  pm.response.to.have.status(201);",
                "  const body = pm.response.json();",
                "  pm.expect(body).to.have.property('message');",
                "  if (body.devCode) pm.environment.set('nitume_dev_code', body.devCode);",
                "});",
              ],
              type: 'text/javascript',
            },
          },
        ],
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: jsonBody('{\n  "phone": "0712345678"\n}'),
          url: u('{{baseUrl}}/auth/otp/request'),
        },
        response: [],
      },
      {
        name: 'OTP Verify (saves tokens)',
        event: [
          {
            listen: 'test',
            script: {
              exec: [
                "pm.test('verify returns 201 + tokens', () => {",
                "  pm.response.to.have.status(201);",
                "  const body = pm.response.json();",
                "  pm.expect(body).to.have.property('user');",
                "  pm.expect(body).to.have.property('tokens');",
                "  pm.environment.set('nitume_access_token', body.tokens.accessToken);",
                "  pm.environment.set('nitume_refresh_token', body.tokens.refreshToken);",
                "  console.log('ACCESS_TOKEN=' + body.tokens.accessToken);",
                "});",
              ],
              type: 'text/javascript',
            },
          },
        ],
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          body: jsonBody('{\n  "phone": "0712345678",\n  "code": "{{nitume_dev_code}}",\n  "role": "customer"\n}'),
          url: u('{{baseUrl}}/auth/otp/verify'),
        },
        response: [],
      },
      post('Refresh', '/auth/refresh', '{\n  "refreshToken": "{{nitume_refresh_token}}"\n}'),
      post('Logout', '/auth/logout', '{\n  "refreshToken": "{{nitume_refresh_token}}"\n}'),
    ]),
    folder('2_Users', [
      req('Me', 'GET', '/users/me'),
    ]),
    folder('3_Customers', [
      req('Me', 'GET', '/customers/me', 'customer'),
      patch('Patch Me', '/customers/me', '{\n  "firstName": "Safari",\n  "lastName": "Njoroge"\n}', 'customer'),
    ]),
    folder('4_Runners', [
      req('Me', 'GET', '/runners/me', 'runner'),
      patch('Availability', '/runners/me/availability', '{\n  "available": true\n}', 'runner'),
      post('Submit verification', '/runners/me/verifications', '{\n  "type": "national_id",\n  "documentKey": "nitume/runners/id-front.jpg",\n  "faceSelfieKey": "nitume/runners/selfie.jpg"\n}', 'runner'),
      req('My verifications', 'GET', '/runners/me/verifications', 'runner'),
      req('My skills', 'GET', '/runners/me/skills', 'runner'),
      req('My service-areas', 'GET', '/runners/me/service-areas', 'runner'),
    ]),
    folder('5_Runners_Admin', [
      req('List runners', 'GET', '/runners', 'admin'),
      patch('Review verification', '/runners/{{runner_id}}/verifications/{{verification_id}}', '{\n  "decision": "approved",\n  "notes": "ID + selfie match; KYC passed."\n}', 'admin'),
    ]),
    folder('6_Errands', [
      post('Create', '/errands', '{\n  "origin": { "lat": -1.286389, "lng": 36.817223, "label": "Karen" },\n  "destination": { "lat": -1.3032, "lng": 36.8333, "label": "Kilimani" },\n  "description": "Deliver a sealed envelope to the Kilimani office",\n  "budget": 450,\n  "deadline": "2026-09-20T12:00:00.000Z",\n  "schedule": "asap"\n}'),
      req('List mine', 'GET', '/errands', 'customer'),
      req('Get one', 'GET', '/errands/{{errand_id}}', 'customer'),
      req('History', 'GET', '/errands/{{errand_id}}/history', 'customer'),
      post('Submit', '/errands/{{errand_id}}/submit', '{\n  "deliveryProof": "nitume/errands/proof.jpg"\n}', 'runner'),
      patch('Transition status', '/errands/{{errand_id}}/status', '{\n  "to": "in_progress"\n}', 'runner'),
      patch('Resolve dispute', '/errands/{{errand_id}}/resolve-dispute', '{\n  "verdict": "refund_customer",\n  "note": "Runner failed to deliver within SLA; refund initiated."\n}', 'admin'),
    ]),
    folder('7_Matching', [
      post('Admin assign', '/errands/{{errand_id}}/assign', '{\n  "candidateRunnerIds": ["{{runner_id}}"]\n}', 'admin'),
      post('Admin quote', '/errands/{{errand_id}}/quote', '{\n  "runnerId": "{{runner_id}}",\n  "amount": 500\n}', 'admin'),
    ]),
    folder('8_Payments', [
      post('Initiate (crypto)', '/payments/{{errand_id}}/initiate', '{\n  "method": "mpesa"\n}', 'customer'),
      patch('Settle', '/payments/{{errand_id}}/settle', '{}', 'admin'),
      req('For errand', 'GET', '/payments/{{errand_id}}', 'customer'),
    ]),
  ],
};

const out = path.join(__dirname, 'Nitume_API.postman_collection.json');
fs.writeFileSync(out, JSON.stringify(collection, null, 2));
console.log('WROTE', out, 'bytes=', fs.statSync(out).size);
