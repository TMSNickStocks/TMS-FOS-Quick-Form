const test=require('node:test'); const assert=require('node:assert/strict');
const {allow,_buckets}=require('../lib/rate-limit');
test('rate limit blocks over threshold',()=>{_buckets.clear();assert.equal(allow('x',2,60000).ok,true);assert.equal(allow('x',2,60000).ok,true);assert.equal(allow('x',2,60000).ok,false);});
