/**
 * Live device test — not part of the normal test suite.
are  * Run with: npx jest --selectProjects device --coverage=false
 *
 * Requires a speaker with TUNEIN in its /sources and a running bose-cloud.mjs
 * (or soundcork) so the speaker can resolve the TuneIn station at play time.
 *
 * The speaker's SoundTouchSdkPrivateCfg.xml must point bmxRegistryUrl and
 * margeServerUrl at the local cloud emulator before rebooting.
 */
import { describe, expect, it } from '@jest/globals';
import { API } from '../devices/SoundTouch/api/api.js';
import { KeyValue } from '../devices/SoundTouch/api/special-types.js';

const SPEAKER_IP = process.env.SPEAKER_IP;
if (!SPEAKER_IP)
  throw new Error('SPEAKER_IP must be set in .env to run device tests');
const TUNE_IN_ID = 's87086'; // The Hits Auckland
const TEST_SLOT = 2;
const TIMEOUT = 30_000;

describe('TUNEIN preset — live speaker', () => {
  it(
    'stores a TUNEIN preset and plays it via key press',
    async () => {
      const api = API.create(SPEAKER_IP);

      const sources = await api.getSources();
      const hasTuneIn = sources?.items.some((s) => s.source === 'TUNEIN');
      if (!hasTuneIn)
        throw new Error(
          'TUNEIN source not available on this speaker — check /sources'
        );

      const stored = await api.storePreset(TEST_SLOT, {
        source: 'TUNEIN',
        sourceAccount: '',
        type: 'stationurl',
        isPresetable: true,
        location: `/v1/playback/station/${TUNE_IN_ID}`,
        itemName: 'The Hits Auckland',
      });
      expect(stored).toBe(true);

      await api.pressKey(`PRESET_${TEST_SLOT}` as KeyValue);
      await new Promise((r) => setTimeout(r, 6000));
      await api.pressKey(`PRESET_${TEST_SLOT}` as KeyValue);

      const nowPlaying = await api.getNowPlaying();
      expect(nowPlaying?.source).toBe('TUNEIN');
    },
    TIMEOUT
  );
});
