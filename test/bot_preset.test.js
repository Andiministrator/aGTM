// test/bot_preset.test.js — tests for the cfg.bot preset (F-127/F-128).
//
// The sGTM Client forwards the api4filter verdict as cfg.bot; the library
// deep-copies it into aGTM.d.bot so webGTM can read it via a JS variable.
// Deliberately NOT part of cfg.session: the bot check runs before and
// independently of the Session API, so it must survive a session outage and
// must not open the session preset gate.
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resetAGTM, MockXHR } from './helpers.js';

describe('cfg.bot preset', () => {
  beforeEach(() => { MockXHR.install(); });
  afterEach(() => { MockXHR.reset(); });

  test('defaults to an empty object when no cfg.bot is given', () => {
    resetAGTM({});
    expect(aGTM.d.bot).toEqual({});
  });

  test('copies a clean verdict into aGTM.d.bot', () => {
    resetAGTM({ bot: { isBot: false, score: 0, band: 'clean', signals: [], primarySignal: null } });
    expect(aGTM.d.bot.isBot).toBe(false);
    expect(aGTM.d.bot.score).toBe(0);
    expect(aGTM.d.bot.band).toBe('clean');
    expect(aGTM.d.bot.signals).toEqual([]);
  });

  test('copies a borderline (scored, not blocked) verdict incl. signals', () => {
    resetAGTM({
      bot: {
        isBot: false, score: 40, band: 'clean', primarySignal: 'asn_spam',
        signals: [{ type: 'asn_reputation', category: 'asn_spam', score: 40, confirmed: true }]
      }
    });
    expect(aGTM.d.bot.score).toBe(40);
    expect(aGTM.d.bot.primarySignal).toBe('asn_spam');
    expect(aGTM.d.bot.signals.length).toBe(1);
    expect(aGTM.d.bot.signals[0].category).toBe('asn_spam');
    expect(aGTM.d.bot.signals[0].confirmed).toBe(true);
  });

  test('is a deep copy — mutating the source config does not change aGTM.d.bot', () => {
    const cfgBot = { isBot: false, score: 0, band: 'clean', signals: [{ category: 'asn_spam' }] };
    resetAGTM({ bot: cfgBot });
    cfgBot.score = 99;
    cfgBot.signals[0].category = 'tampered';
    expect(aGTM.d.bot.score).toBe(0);
    expect(aGTM.d.bot.signals[0].category).toBe('asn_spam');
  });

  test('ignores a cfg.bot without a boolean isBot (malformed / partial response)', () => {
    resetAGTM({ bot: { score: 40, band: 'clean' } });
    expect(aGTM.d.bot).toEqual({});
  });

  test('ignores a non-object cfg.bot', () => {
    resetAGTM({ bot: 'true' });
    expect(aGTM.d.bot).toEqual({});
  });

  test('does NOT touch the session preset gate', () => {
    resetAGTM({ bot: { isBot: false, score: 0, band: 'clean' } });
    expect(aGTM.d.bot.isBot).toBe(false);
    // No cfg.session -> session stays empty and unset, independent of cfg.bot
    expect(aGTM.d.session_status).toBe('');
    expect(aGTM.d.session).toEqual({});
  });

  test('survives alongside a session preset without interfering', () => {
    resetAGTM({
      session: { sid: 's-1', uid: 'u-1' },
      bot: { isBot: false, score: 40, band: 'clean', primarySignal: 'asn_spam' }
    });
    expect(aGTM.d.session_status).toBe('preset');
    expect(aGTM.d.session.sid).toBe('s-1');
    expect(aGTM.d.bot.primarySignal).toBe('asn_spam');
    // The verdict must not have leaked into the session object
    expect(aGTM.d.session.bot).toBeUndefined();
  });

  test('logs m_bot_preset so aGTM.l/the Inspector can decode it', () => {
    resetAGTM({ bot: { isBot: false, score: 0, band: 'clean' } });
    const ids = aGTM.l.map(e => e.id);
    expect(ids).toContain('m_bot_preset');
  });
});
