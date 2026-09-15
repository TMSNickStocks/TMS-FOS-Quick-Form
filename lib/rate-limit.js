const { hmac } = require('./security');
const buckets = new Map();

function prune(now) {
  for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
}

function allow(key, limit, windowMs) {
  const now = Date.now();
  prune(now);
  const current = buckets.get(key);
  if (!current || current.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  current.count += 1;
  return { ok: current.count <= limit, remaining: Math.max(0, limit - current.count) };
}

function submissionRateKeys(ip, reference) {
  return { ip: `ip:${hmac(ip)}`, ref: `ref:${hmac(reference)}` };
}

module.exports = { allow, submissionRateKeys, _buckets: buckets };
