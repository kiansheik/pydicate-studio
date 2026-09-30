'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { categoricalDetails } = require('../research.cjs');

test('usage retains known tab destinations and search outcomes without user text', () => {
  assert.deepEqual(categoricalDetails({event:'navigation.projection',details:{from:'Árvore',to:'Tradução',query:'private text'}}), {ui:{from:'Árvore',to:'Tradução'}});
  assert.deepEqual(categoricalDetails({event:'lexicon.search',details:{source:'rendered-form',resultCount:0,query:'private text',password:'secret'}}), {ui:{source:'rendered-form',resultCount:0}});
  assert.deepEqual(categoricalDetails({event:'lexicon.select',details:{source:'dictionary',category:'entry',reused:false}}), {ui:{source:'dictionary',category:'entry',reused:false}});
  assert.deepEqual(categoricalDetails({event:'navigation.mode',details:{from:'analysis',to:'dictionary'}}), {ui:{from:'analysis',to:'dictionary'}});
});

test('unknown labels, wrong event families and invalid counts are discarded', () => {
  assert.deepEqual(categoricalDetails({event:'navigation.projection',details:{from:'private text',to:'analysis',source:'dictionary',resultCount:1}}), {ui:{}});
  for (const resultCount of [-1, 1.5, Infinity, '2', 1e10])
    assert.deepEqual(categoricalDetails({event:'lexicon.search',details:{source:'secret',category:'secret',reused:'yes',resultCount}}), {ui:{}});
});
