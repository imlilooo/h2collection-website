-- All transitions are atomic. KEYS: challenge, phone session, phone limit, IP limit.
local op = ARGV[1]
local now = tonumber(ARGV[2])
local id = ARGV[3]
local binding = ARGV[4]
local function field(name) return redis.call('HGET', KEYS[1], name) end
local active = redis.call('GET', KEYS[2])
if op == 'reserve' then
  if field('binding') and field('binding') ~= binding then return 'invalid' end
  if active then
    local state = redis.call('HGET', active, 'status')
    if state == 'processing' or state == 'uncertain' then return 'busy' end
    local nextSend = tonumber(redis.call('HGET', active, 'next') or '0')
    local fallback = ARGV[7] == 'sms' and active == KEYS[1] and redis.call('HGET', active, 'fallback') == '1'
    if now < nextSend and not fallback then return 'cooldown' end
  end
  if ARGV[7] == 'sms' and (active ~= KEYS[1] or field('binding') ~= binding) then return 'invalid' end
  if tonumber(redis.call('GET', KEYS[3]) or '0') >= 5 or tonumber(redis.call('GET', KEYS[4]) or '0') >= 20 then return 'limit' end
  for i=3,4 do
    local n = redis.call('INCR', KEYS[i])
    if n == 1 then redis.call('EXPIRE', KEYS[i], 3600) end
  end
  if active and active ~= KEYS[1] then redis.call('DEL', active) end
  redis.call('SET', KEYS[2], KEYS[1], 'EX', 300)
  redis.call('HSET', KEYS[1], 'binding', binding, 'code', ARGV[5], 'status', 'sending', 'expires', now+300000, 'next', now+60000, 'attempts', 0, 'fallback', 0)
  redis.call('EXPIRE', KEYS[1], 300)
  return 'ok'
end
if active ~= KEYS[1] or not field('binding') or tonumber(field('expires')) <= now then return 'expired' end
if field('binding') ~= binding then return 'invalid' end
if op == 'sent' or op == 'sendFailed' then
  if field('code') ~= ARGV[5] or field('status') ~= 'sending' then return 'invalid' end
  redis.call('HSET', KEYS[1], 'status', op == 'sent' and 'ready' or 'failed', 'fallback', ARGV[6])
  return 'ok'
end
if op == 'verify' then
  if tonumber(field('attempts')) >= 5 then return 'attempts' end
  if field('code') ~= ARGV[5] then
    redis.call('HINCRBY', KEYS[1], 'attempts', 1)
    return 'wrong'
  end
  local state = field('status')
  if state == 'done' then return 'done' end
  if state ~= 'ready' then return 'busy' end
  redis.call('HSET', KEYS[1], 'status', 'processing')
  return 'ok'
end
if op == 'done' or op == 'retry' or op == 'uncertain' then
  if field('status') ~= 'processing' then return 'invalid' end
  redis.call('HSET', KEYS[1], 'status', op == 'retry' and 'ready' or op)
  return 'ok'
end
return 'invalid'
