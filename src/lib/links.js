export function validateUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildYouTubeSearch(subject, topic = 'NPTEL') {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${subject} ${topic}`)}`;
}

export function buildNptelUrl(query = '') {
  return query ? `https://nptel.ac.in/courses?search=${encodeURIComponent(query)}` : 'https://nptel.ac.in/course.html';
}

export function buildSwayamUrl(topic = '') {
  return `https://swayam.gov.in/explorer?searchText=${encodeURIComponent(topic || 'engineering')}`;
}

export function buildOpenLibraryUrl(title = '') {
  return `https://openlibrary.org/search?q=${encodeURIComponent(title || 'engineering')}`;
}

export function buildGoogleBooksUrl(title = '') {
  return `https://www.google.com/books?q=${encodeURIComponent(title || 'engineering')}`;
}

export function buildMuNoticeUrl() {
  return 'https://mu.ac.in';
}

export function buildAicteUrl() {
  return 'https://www.aicte-india.org';
}

export function buildUgcUrl() {
  return 'https://www.ugc.gov.in';
}
