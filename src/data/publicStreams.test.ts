import { describe, expect, it } from 'vitest';
import { publicStreams, savePublicStream, youtubeId } from './publicStreams';
describe('public owner video embeds', () => {
  it('accepts only supported HTTPS YouTube video IDs', () => {
    expect(youtubeId('https://youtube.com/live/abcdefghijk')).toBe('abcdefghijk');
    expect(youtubeId('https://youtu.be/abcdefghijk')).toBe('abcdefghijk');
    expect(youtubeId('https://youtube.com.attacker.test/watch?v=abcdefghijk')).toBeNull();
    expect(youtubeId('javascript:alert(1)')).toBeNull();
  });
  it('deduplicates and persists location while rejecting invalid coordinates', () => {
    localStorage.clear();
    savePublicStream('https://youtube.com/watch?v=abcdefghijk', 'Public harbor', 60, 25);
    savePublicStream('https://youtu.be/abcdefghijk', 'Public harbor updated', 61, 26);
    expect(publicStreams()).toHaveLength(1);
    expect(publicStreams()[0].latitude).toBe(61);
    expect(() => savePublicStream('https://youtu.be/abcdefghijk', 'Invalid', 91, 26)).toThrow();
  });
});
