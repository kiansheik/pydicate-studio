'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');

function page(script, url, respond) {
  const elements = new Map(), requests = [], history = [], navigations = [];
  const location = new URL(url);
  location.replace = value => navigations.push(value);
  location.assign = value => navigations.push(value);
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value:'', hidden:false, reportValidity:()=>true, closest:()=>({hidden:false})});
    return elements.get(id);
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/' + script), 'utf8'), {
    document:{getElementById:element}, location, URLSearchParams,
    history:{replaceState:(_state,_title,value)=>{history.push(value);location.href=new URL(value,location).href;}},
    fetch:async (route, options) => {
      assert.equal(location.hash, '', 'Authentication secrets are removed before any fetch');
      const body = options?.body ? JSON.parse(options.body) : undefined;
      requests.push({route,body});
      return {ok:true,json:async()=>respond(route,body)};
    },
  });
  return {element, requests, history, navigations, flush:async()=>{for(let i=0;i<20;i++)await Promise.resolve();}};
}

test('password reset removes its secret and retains navigation through the following login', async () => {
  const target = '/?passage=passage%3Aa&tab=enosem', query = '?returnTo=' + encodeURIComponent(target);
  const reset = page('auth.js','https://studio.example/account'+query+'#token=reset-secret',()=>({}));
  assert.deepEqual(reset.history,['/account'+query]);
  reset.element('password').value='new long password';
  await reset.element('account-form').onsubmit({preventDefault(){}});
  assert.deepEqual(reset.requests.find(r=>r.route==='/api/reset').body,{token:'reset-secret',password:'new long password'});
  assert.deepEqual(reset.navigations,['/login'+query]);
  assert.equal(reset.element('password').value,'');
  const login = page('auth.js','https://studio.example'+reset.navigations[0],route=>route==='/api/login'?{returnTo:target}:{});
  login.element('email').value='student@example.org';login.element('password').value='new long password';
  await login.element('account-form').onsubmit({preventDefault(){}});
  assert.equal(login.requests.find(r=>r.route==='/api/login').body.returnTo,target);
  assert.deepEqual(login.navigations,[target]);
});

test('invitation SSO forwards the destination without retaining the invite token in history', async () => {
  const target='/?passage=passage%3Aa&view=tree';
  const fixture=page('auth.js','https://studio.example/account?returnTo='+encodeURIComponent(target)+'#token=invite-secret',
    route=>route==='/api/auth-options'?{academia:true}:{url:'https://neo.example/consent'});
  await fixture.flush();await fixture.element('academia').onclick();
  assert.deepEqual(fixture.requests.find(r=>r.route==='/api/sso/start').body,{returnTo:target,inviteToken:'invite-secret'});
  assert.equal(fixture.history.some(url=>url.includes('invite-secret')),false);
  assert.deepEqual(fixture.navigations,['https://neo.example/consent']);
});

test('SSO callback clears credentials and follows only the server-validated destination', async () => {
  const target='/?passage=passage%3Aa&node=var%3A1';
  const fixture=page('sso.js','https://studio.example/sso/callback#code=secret&state=nonce&iss=https%3A%2F%2Fneo.example&returnTo=https%3A%2F%2Fevil.example',()=>({ok:true,returnTo:target}));
  await fixture.flush();
  assert.deepEqual(fixture.history,['/sso/callback']);
  assert.deepEqual(fixture.navigations,[target]);
});
