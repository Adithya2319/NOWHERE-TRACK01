import { describe, expect, it } from 'vitest';
import {
  validateUrl,
  buildYouTubeSearch,
  buildNptelUrl,
  buildSwayamUrl,
  buildOpenLibraryUrl,
  buildGoogleBooksUrl,
  buildMuNoticeUrl,
  buildAicteUrl,
  buildUgcUrl,
} from './links';

describe('link helpers', () => {
  it('builds valid https URLs for learning sources', () => {
    const urls = [
      buildYouTubeSearch('DBMS', 'NPTEL'),
      buildNptelUrl('DBMS'),
      buildSwayamUrl('DBMS'),
      buildOpenLibraryUrl('DBMS'),
      buildGoogleBooksUrl('DBMS'),
      buildMuNoticeUrl(),
      buildAicteUrl(),
      buildUgcUrl(),
    ];

    for (const url of urls) {
      expect(validateUrl(url)).toBe(true);
      expect(url.startsWith('https://')).toBe(true);
    }
  });
});
