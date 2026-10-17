export async function forecastCourse(course, marks = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${import.meta.env.VITE_ML_SERVICE_URL || 'http://localhost:8000'}/predict`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ assessments: Object.entries(course.maxima).map(([key, maximum]) => ({ maximum, score: marks[key] ?? null })) }),
    });
    if (!response.ok) throw Error(`Forecast service returned ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
