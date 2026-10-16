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

const put = (name, pathname, raw, actingRole) => ({
  name,
  request: {
    method: 'PUT',
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
    { key: 'price_change_request_id', value: '', type: 'string' },
    { key: 'payout_line_id', value: '', type: 'string' },
    { key: 'receipt_evidence_id', value: '', type: 'string' },
    { key: 'refund_id', value: '', type: 'string' },
    { key: 'payout_request_id', value: '', type: 'string' },
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
      post('Admin assign (offer open 10 min: assignment.offerExpiresAt, rows 114, 141)', '/errands/{{errand_id}}/assign', '{\n  "runnerProfileId": "{{runner_id}}"\n}', 'admin'),
      patch('Runner accept offer (RUNNER_EN_ROUTE; 409 offer_expired { offerExpiresAt } after the deadline)', '/errands/{{errand_id}}/status', '{\n  "to": "RUNNER_EN_ROUTE"\n}', 'runner'),
      post('Admin quote', '/errands/{{errand_id}}/quote', '{\n  "runnerId": "{{runner_id}}",\n  "amount": 500\n}', 'admin'),
    ]),
    folder('8_Payments', [
      post('Initiate (crypto)', '/payments/{{errand_id}}/initiate', '{\n  "method": "mpesa"\n}', 'customer'),
      patch('Settle', '/payments/{{errand_id}}/settle', '{}', 'admin'),
      req('For errand', 'GET', '/payments/{{errand_id}}', 'customer'),
    ]),
    folder('9_Owner_Answers_2026_10_08', [
      req('Rating (owner/current runner/admin only)', 'GET', '/errands/{{errand_id}}/rating', 'customer'),
      req('Refund status (404 refund_not_found when none)', 'GET', '/errands/{{errand_id}}/refund', 'customer'),
      put('Admin merchant Till/Paybill details', '/errands/{{errand_id}}/merchant-details', '{\n  "merchantName": "Naivas Nyali",\n  "tillNumber": "123456"\n}', 'admin'),
      post('Admin re-quote an expired quote', '/errands/{{errand_id}}/quote', '{\n  "total": 1200,\n  "expiresAt": "2026-12-31T12:00:00.000Z"\n}', 'admin'),
      post('Runner price change (IN_PROGRESS only)', '/errands/{{errand_id}}/price-change', '{\n  "toPrice": 650,\n  "reason": "Price went up"\n}', 'runner'),
      post('Approve price change (increase charged by original route)', '/errands/{{errand_id}}/price-change/{{price_change_request_id}}/approve', '{}', 'customer'),
      post('Retry FAILED price-difference STK', '/payments/{{errand_id}}/price-changes/{{price_change_request_id}}/initiate', '{}', 'customer'),
      req('Evidence (15-minute signed URLs)', 'GET', '/errands/{{errand_id}}/evidence', 'customer'),
      req('Tracking (current assignment only for runners)', 'GET', '/errands/{{errand_id}}/tracking', 'runner'),
    ]),
    folder('10_Runner_Payout_Ledger_2026_10_13', [
      req('Runner earnings (available / pending / on hold / paid, EAT week)', 'GET', '/runners/me/earnings?groupBy=day', 'runner'),
      req('Runner payout feed (signed lines, derived payouts)', 'GET', '/runners/me/payout-lines?limit=25', 'runner'),
      req('Runner payout feed for one task (RA-16)', 'GET', '/runners/me/payout-lines?errandId={{errand_id}}', 'runner'),
      post('Runner item claim after CANCELLED/FAILED (row 106)', '/runners/me/reimbursement-claims', '{\n  "errandId": "{{errand_id}}",\n  "amount": 400,\n  "receiptEvidenceId": "{{receipt_evidence_id}}",\n  "note": "Bought before the cancel"\n}', 'runner'),
      req('Purchase check vs max_purchase_advance (row 108)', 'GET', '/errands/{{errand_id}}/purchase-check', 'runner'),
      post('Decline over purchase limit (row 108)', '/errands/{{errand_id}}/assignment/decline', '{\n  "reason": "over_purchase_limit"\n}', 'runner'),
      req('Admin ledger list (status=on_hold|payable|paid|rejected)', 'GET', '/runner-payouts?status=on_hold', 'admin'),
      req('Admin ledger count', 'GET', '/runner-payouts/count?status=on_hold', 'admin'),
      req('Admin runner summary', 'GET', '/runner-payouts/summary?runnerProfileId={{runner_id}}', 'admin'),
      req('Admin line detail', 'GET', '/runner-payouts/{{payout_line_id}}', 'admin'),
      post('Admin review item line (approve, capped)', '/runner-payouts/{{payout_line_id}}/review', '{\n  "decision": "approve",\n  "amount": 450,\n  "note": "Receipt checked"\n}', 'admin'),
      post('Admin review above the combined cap (row 136 override, audited)', '/runner-payouts/{{payout_line_id}}/review', '{\n  "decision": "approve",\n  "amount": 400,\n  "exposureOverrideNote": "Refund went out before the receipt came in"\n}', 'admin'),
      patch('Admin refund decision above the combined cap (row 136 override)', '/refunds/{{refund_id}}/decision', '{\n  "refundAmount": 700,\n  "exposureOverrideNote": "Runner reimbursement approved earlier by ops"\n}', 'admin'),
      post('Admin hold item line (receipt mismatch)', '/runner-payouts/{{payout_line_id}}/hold', '{\n  "note": "Receipt total does not match"\n}', 'admin'),
      post('Admin mark paid (one M-Pesa payout, one runner)', '/runner-payouts/mark-paid', '{\n  "lineIds": ["{{payout_line_id}}"],\n  "payoutReference": "SLK4H7XQ2P"\n}', 'admin'),
      post('Admin correction / reversal / resent_payout', '/runner-payouts/{{payout_line_id}}/corrections', '{\n  "kind": "reversal",\n  "newReference": "RVS1234567",\n  "reason": "Sent to the wrong number",\n  "expectedLatestCorrectionId": null\n}', 'admin'),
    ]),
    folder('11_Owner_Answers_Rounds_8_9_2026_10_16', [
      // Round 8 (rows 117, 146, 151-154) and round 9 (rows 157-184, review minors).
      post('Admin review above the purchase limit (rows 142, 151; note 10-500, ignored under the ordinary ceiling)', '/runner-payouts/{{payout_line_id}}/review', '{\n  "decision": "approve",\n  "amount": 3500,\n  "purchaseLimitOverrideNote": "Approved by ops lead on the phone"\n}', 'admin'),
      req('Runner payout request summary (minimumAmount KES 500, availableAmount, requestableAmount, openRequest)', 'GET', '/runners/me/payout-requests/summary', 'runner'),
      {
        ...post('Runner request a payout (Idempotency-Key bound to the amount)', '/runners/me/payout-requests', '{\n  "amount": 1500\n}', 'runner'),
        request: {
          ...post('x', '/runners/me/payout-requests', '{\n  "amount": 1500\n}', 'runner').request,
          header: [
            ...bearer('runner'),
            { key: 'Content-Type', value: 'application/json' },
            { key: 'Idempotency-Key', value: '{{$guid}}' },
          ],
        },
      },
      req('Runner payout requests (requested | paid | rejected | cancelled; no cancel reason)', 'GET', '/runners/me/payout-requests?limit=25', 'runner'),
      req('Admin payout requests (status filter incl. cancelled)', 'GET', '/runner-payout-requests?status=requested', 'admin'),
      req('Admin payout request count (badge)', 'GET', '/runner-payout-requests/count?status=requested', 'admin'),
      req('Admin payout request detail (createdBy, updatedAt, cancel fields)', 'GET', '/runner-payout-requests/{{payout_request_id}}', 'admin'),
      post('Admin pay a request with whole payable lines', '/runner-payout-requests/{{payout_request_id}}/pay', '{\n  "lineIds": ["{{payout_line_id}}"],\n  "payoutReference": "SGH81PRQ01"\n}', 'admin'),
      post('Admin reject a request (note 5-300, shown to the runner)', '/runner-payout-requests/{{payout_request_id}}/reject', '{\n  "note": "Please confirm your M-Pesa name first"\n}', 'admin'),
      post('Admin cancel a request (row 166; reason 10-500, ops only)', '/runner-payout-requests/{{payout_request_id}}/cancel', '{\n  "reason": "Destination number failed the fraud check"\n}', 'admin'),
      {
        name: 'Runner upload ID side or selfie (multipart, 10 MB, JPEG/PNG/WebP/HEIC by bytes, side front|back for an ID)',
        request: {
          method: 'POST',
          header: bearer('runner'),
          body: {
            mode: 'formdata',
            formdata: [
              { key: 'verificationType', value: 'government_id', type: 'text' },
              { key: 'side', value: 'front', type: 'text', description: 'front | back, government_id only (row 195)' },
              { key: 'file', type: 'file', src: '' },
            ],
          },
          url: u('{{baseUrl}}/runners/me/verifications/documents'),
        },
        response: [],
      },
      req('Admin verification queue (hasDocument, purgedAt, reviewer, reReviews[])', 'GET', '/runners/verifications?status=pending&limit=50', 'admin'),
      req('Admin signed ID image link (<= 5 min, logged; never restarts retention)', 'GET', '/runners/verifications/{{verification_id}}/document', 'admin'),
      post('Admin re-review evidence (row 171; optional note <= 500; restarts retention)', '/runners/verifications/{{verification_id}}/re-review', '{\n  "note": "Second check after a fraud flag"\n}', 'admin'),
      req('Admin errand detail (lastAssignment, assignments[], offerWindowSeconds)', 'GET', '/errands/{{errand_id}}', 'admin'),
      post('Admin offer / re-offer a runner (409 runner_already_offered)', '/errands/{{errand_id}}/assign', '{\n  "runnerProfileId": "{{runner_id}}"\n}', 'admin'),
    ]),
  ],
};

const out = path.join(__dirname, 'Nitume_API.postman_collection.json');
fs.writeFileSync(out, JSON.stringify(collection, null, 2));
console.log('WROTE', out, 'bytes=', fs.statSync(out).size);
