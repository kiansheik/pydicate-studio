'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { safeReturnTo } = require('../return-to.cjs');
const { AcademiaIdentity } = require('../identity.cjs');
const { createHash } = require('node:crypto');

test('authentication return destinations preserve only root navigation queries', () => {
  const destination = '/?passage=passage%3Aabc&source=historic%2Faraujo.tu.py&view=tree&tab=enosem&node=var%3A1';
  assert.equal(safeReturnTo(destination), destination);
  assert.equal(safeReturnTo('/'), '/');
  assert.equal(safeReturnTo('/?tab=%C3%AEeky%C3%AE'), '/?tab=%C3%AEeky%C3%AE');
});

test('SSO return cookies fail closed when missing, malformed, duplicated or replaced', () => {
  const identity = new AcademiaIdentity({}, {secure:true});
  const flowCookie = 'a'.repeat(43), flow = createHash('sha256').update(flowCookie).digest('hex');
  const cookie = returnTo => identity.destinationCookie(Buffer.from(JSON.stringify({flow,returnTo})).toString('base64url'));
  const valid = cookie('/?passage=passage%3Aa');
  assert.equal(identity.returnDestination(valid, flowCookie), '/?passage=passage%3Aa');
  assert.equal(identity.returnDestination(valid, 'b'.repeat(43)), '/');
  assert.equal(identity.returnDestination(valid + '; ' + valid, flowCookie), '/');
  assert.equal(identity.returnDestination('', flowCookie), '/');
  assert.equal(identity.returnDestination(identity.destinationCookie('not-json'), flowCookie), '/');
  assert.equal(identity.returnDestination(identity.destinationCookie('x'.repeat(3501)), flowCookie), '/');
  for (const target of ['https://evil.example', '//evil.example', '/\\evil.example', '/api/logout', '/?passage=%0aevil']) {
    assert.equal(identity.returnDestination(cookie(target), flowCookie), '/');
  }
  assert.match(identity.destinationCookie('',true), /^__Host-studio-identity-return=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Secure$/);
});

test('authentication redirects reject external, non-root and malformed destinations', () => {
  for (const value of [null, 123, {}, '', 'https://evil.example/', '//evil.example/',
    '\\\\evil.example', '/\\evil.example', '/%2f%2fevil.example', 'javascript:alert(1)',
    '/login', '/sso/callback', '/api/logout', '/a/../?passage=abc', ' /?passage=abc',
    '/?passage=a\nLocation:https://evil.example', '/?passage=%0aevil', '/?passage=%5cevil',
    '/?passage=%', '/#token=secret', '/?passage=abc#token=secret', '/?passage=' + 'x'.repeat(2048)]) {
    assert.equal(safeReturnTo(value), '/', String(value));
  }
});
