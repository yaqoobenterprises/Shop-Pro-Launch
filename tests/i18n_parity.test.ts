import { afterEach, describe, expect, it } from 'vitest';
import { en } from '../src/i18n';
import { ur } from '../src/i18n/ur';
import { parseMessage } from '../src/parser';
import { resetModuleRegion, setModuleRegion } from '../src/regional/region';

describe('English and Urdu translation dictionaries', () => {
  afterEach(() => resetModuleRegion());

  it('provide matching, non-empty translations for every key', () => {
    expect(Object.keys(ur).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(en[key].trim(), `English translation for ${key}`).not.toBe('');
      expect(ur[key].trim(), `Urdu translation for ${key}`).not.toBe('');
      expect([...en[key].matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort())
        .toEqual([...ur[key].matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort());
    }
  });

  it('localizes parser clarification prompts for Urdu without changing classification', () => {
    setModuleRegion({ uiLanguage: 'ur' });
    const entry = parseMessage('100').entries[0];

    expect(entry.action).toBe('ask_clarification');
    expect(entry.clarificationPrompt).toContain('صرف رقم درج کی گئی ہے');
    expect(entry.clarificationPrompt).toMatch(/[\u0600-\u06FF]/);
    expect(entry.clarificationPrompt).not.toContain('\uFFFD');
  });
});
