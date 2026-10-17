import { describe, expect, it } from 'vitest';
import { getRideTimeUpdate, isRideRequestExpired, RIDE_REQUEST_TIMEOUT_MS, RIDE_STATES, rankRides, transitionRideState } from './rideMachine';

describe('ride state machine', () => {
  it('transitions through the allowed states', () => {
    expect(transitionRideState(RIDE_STATES.AVAILABLE, 'request')).toBe(RIDE_STATES.REQUESTED);
    expect(transitionRideState(RIDE_STATES.REQUESTED, 'confirm')).toBe(RIDE_STATES.CONFIRMED);
    expect(transitionRideState(RIDE_STATES.CONFIRMED, 'cancel')).toBe(RIDE_STATES.CANCELLED);
  });

  it('ranks rides by proximity and availability', () => {
    const rides = [
      { id: 1, lat: 19.03, lng: 72.93, seats: 2, verified: true, departure: '18:00' },
      { id: 2, lat: 19.12, lng: 72.89, seats: 1, verified: false, departure: '19:00' },
    ];

    const ranked = rankRides(rides, { lat: 19.05, lng: 72.91 });
    expect(ranked[0].id).toBe(1);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('shows ride updates within the upcoming and recently-departed time windows', () => {
    const now = new Date('2026-10-14T12:00:00.000Z');

    expect(getRideTimeUpdate(
      { state: RIDE_STATES.CONFIRMED, departureAt: '2026-10-14T12:30:00.000Z' },
      now,
    )).toMatchObject({ type: 'upcoming', minutesUntilDeparture: 30 });
    expect(getRideTimeUpdate(
      { state: RIDE_STATES.REQUESTED, departureAt: '2026-10-14T11:45:00.000Z' },
      now,
    )).toMatchObject({ type: 'departed', minutesSinceDeparture: 15 });
    expect(getRideTimeUpdate(
      { state: RIDE_STATES.CANCELLED, departureAt: '2026-10-14T12:30:00.000Z' },
      now,
    )).toBeNull();
    expect(getRideTimeUpdate(
      { state: RIDE_STATES.AVAILABLE, departureAt: '2026-10-16T12:00:00.000Z' },
      now,
    )).toBeNull();
  });

  it('expires unaccepted ride requests at 15 minutes and keeps accepted rides', () => {
    const now = Date.parse('2026-10-14T12:15:00.000Z');
    const pendingRequest = {
      state: RIDE_STATES.REQUESTED,
      requestedAt: new Date(now - RIDE_REQUEST_TIMEOUT_MS).toISOString(),
    };

    expect(isRideRequestExpired(pendingRequest, now - 1)).toBe(false);
    expect(isRideRequestExpired(pendingRequest, now)).toBe(true);
    expect(isRideRequestExpired({ ...pendingRequest, state: RIDE_STATES.CONFIRMED }, now)).toBe(false);
    expect(isRideRequestExpired({ state: RIDE_STATES.REQUESTED }, now)).toBe(true);
  });
});
