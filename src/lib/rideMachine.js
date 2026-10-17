export const RIDE_STATES = {
  AVAILABLE: 'Available',
  REQUESTED: 'Requested',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

export const RIDE_REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

export function isRideRequestExpired(ride, now = Date.now()) {
  if (ride.state !== RIDE_STATES.REQUESTED) return false;
  const requestedAt = Date.parse(ride.requestedAt || '');
  return !Number.isFinite(requestedAt) || now - requestedAt >= RIDE_REQUEST_TIMEOUT_MS;
}

export function transitionRideState(currentState, event) {
  const state = currentState || RIDE_STATES.AVAILABLE;
  const transitions = {
    [RIDE_STATES.AVAILABLE]: {
      request: RIDE_STATES.REQUESTED,
      confirm: RIDE_STATES.CONFIRMED,
      cancel: RIDE_STATES.CANCELLED,
      expire: RIDE_STATES.EXPIRED,
    },
    [RIDE_STATES.REQUESTED]: {
      confirm: RIDE_STATES.CONFIRMED,
      cancel: RIDE_STATES.CANCELLED,
      expire: RIDE_STATES.EXPIRED,
      reopen: RIDE_STATES.AVAILABLE,
    },
    [RIDE_STATES.CONFIRMED]: {
      cancel: RIDE_STATES.CANCELLED,
      expire: RIDE_STATES.EXPIRED,
    },
    [RIDE_STATES.CANCELLED]: {
      reopen: RIDE_STATES.AVAILABLE,
    },
    [RIDE_STATES.EXPIRED]: {
      reopen: RIDE_STATES.AVAILABLE,
    },
  };

  return transitions[state]?.[event] || state;
}

export function getRideTimeUpdate(ride, now = new Date()) {
  if (![RIDE_STATES.AVAILABLE, RIDE_STATES.REQUESTED, RIDE_STATES.CONFIRMED].includes(ride.state)) {
    return null;
  }

  let departureAt;
  if (ride.departureAt) {
    departureAt = new Date(ride.departureAt);
  } else if (ride.departureDate && ride.departure) {
    departureAt = new Date(`${ride.departureDate}T${ride.departure}`);
  } else if (/^\d{2}:\d{2}$/.test(ride.departure || '')) {
    const [hours, minutes] = ride.departure.split(':').map(Number);
    departureAt = new Date(now);
    departureAt.setHours(hours, minutes, 0, 0);
    if (departureAt < now) departureAt.setDate(departureAt.getDate() + 1);
  } else {
    return null;
  }

  if (Number.isNaN(departureAt.getTime())) return null;
  const minutesUntilDeparture = Math.ceil((departureAt.getTime() - now.getTime()) / 60000);
  if (minutesUntilDeparture >= 0 && minutesUntilDeparture <= 24 * 60) {
    return { type: 'upcoming', departureAt, minutesUntilDeparture };
  }

  const minutesSinceDeparture = -minutesUntilDeparture;
  if (minutesSinceDeparture > 0 && minutesSinceDeparture <= 60) {
    return { type: 'departed', departureAt, minutesSinceDeparture };
  }

  return null;
}

export function rankRides(rides, userCoords = { lat: 19.033, lng: 73.029 }) {
  return rides
    .map((ride) => {
      const pickupDistance = Math.abs((ride.lat || 19.02) - userCoords.lat) + Math.abs((ride.lng || 72.95) - userCoords.lng);
      const proximityScore = Math.max(0, 100 - pickupDistance * 1500);
      const departureMinutes = Number((ride.departure || '18:00').split(':')[0]) * 60 + Number((ride.departure || '18:00').split(':')[1]);
      const departureDiff = Math.abs(departureMinutes - 1080);
      const departureScore = Math.max(0, 100 - departureDiff / 2.2);
      const seatsScore = (ride.seats || 0) * 18;
      const verificationBonus = ride.verified ? 20 : 0;
      const total = proximityScore + departureScore + seatsScore + verificationBonus;

      return {
        ...ride,
        score: Number(total.toFixed(1)),
        matchBreakdown: {
          pickupDistance: Number(pickupDistance.toFixed(2)),
          proximityScore: Number(proximityScore.toFixed(1)),
          departureScore: Number(departureScore.toFixed(1)),
          seatsScore: Number(seatsScore.toFixed(1)),
          verificationBonus,
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}
