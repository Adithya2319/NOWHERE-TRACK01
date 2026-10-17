// Attendance plans are arithmetic scenarios, not official eligibility decisions.
// Decimal targets are compared as rational numbers so floating-point rounding
// cannot advertise one extra lecture as safe to miss at a boundary.
function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a nonnegative safe integer.`);
  }
}

function counts(present, total) {
  count(present, "Present lectures");
  count(total, "Total lectures");
  if (present > total) {
    throw new Error("Present lectures cannot exceed total lectures.");
  }
}

function targetFraction(target) {
  if (target == null) return null;
  if (!Number.isFinite(target) || target <= 0 || target > 100) {
    throw new Error("Attendance target must be greater than 0 and at most 100.");
  }
  const [coefficient, exponent = "0"] = target.toString().split("e");
  const [whole, decimal = ""] = coefficient.split(".");
  const power = Number(exponent) - decimal.length;
  const digits = BigInt(whole + decimal);
  return power >= 0
    ? { numerator: digits * 10n ** BigInt(power), denominator: 1n }
    : { numerator: digits, denominator: 10n ** BigInt(-power) };
}

function ceiling(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator;
}

// Counts within the safe-integer range convert exactly. For an exceptionally
// large answer, round conservatively: recovery up, safe absences down.
function numericCount(value, direction) {
  const result = Number(value);
  if (!Number.isFinite(result)) {
    return direction === "down" ? Number.MAX_VALUE : Infinity;
  }
  const represented = BigInt(result);
  const step = Math.max(1, result * Number.EPSILON);
  if (direction === "up" && represented < value) return result + step;
  if (direction === "down" && represented > value) return result - step;
  return result;
}

function percentage(present, total) {
  return total ? (present / total) * 100 : null;
}

export function attendanceAdvice(present, total, target) {
  counts(present, total);
  const fraction = targetFraction(target);
  const current = percentage(present, total);
  if (!fraction) return { percentage: current, recover: null, miss: null };

  const { numerator, denominator } = fraction;
  const scale = 100n * denominator;
  const deficit = numerator * BigInt(total) - scale * BigInt(present);
  const recover = deficit <= 0n
    ? 0
    : scale === numerator
      ? Infinity
      : numericCount(ceiling(deficit, scale - numerator), "up");
  const miss = deficit >= 0n
    ? 0
    : numericCount((-deficit) / numerator, "down");
  return { percentage: current, recover, miss };
}

export function forecastAttendance({ present, total, remaining, plannedPresent, target = null }) {
  counts(present, total);
  count(remaining, "Future conducted lectures");
  count(plannedPresent, "Planned attended lectures");
  if (plannedPresent > remaining) {
    throw new Error("Planned attended lectures cannot exceed future conducted lectures.");
  }
  const projectedTotal = total + remaining;
  count(projectedTotal, "Projected total lectures");
  const fraction = targetFraction(target);
  const projectedPresent = present + plannedPresent;
  const allAttendPresent = present + remaining;
  let minimumRequired = null;
  let maxMisses = null;
  let reachable = null;
  let projectedMeetsTarget = null;

  if (fraction && projectedTotal) {
    const { numerator, denominator } = fraction;
    const scale = 100n * denominator;
    const requiredTotal = ceiling(numerator * BigInt(projectedTotal), scale);
    const required = requiredTotal > BigInt(present) ? requiredTotal - BigInt(present) : 0n;
    minimumRequired = numericCount(required, "up");
    reachable = required <= BigInt(remaining);
    maxMisses = reachable ? remaining - minimumRequired : null;
    projectedMeetsTarget = scale * BigInt(projectedPresent) >= numerator * BigInt(projectedTotal);
  }

  return {
    projectedPresent,
    projectedTotal,
    projectedPercentage: percentage(projectedPresent, projectedTotal),
    allAttendPercentage: percentage(allAttendPresent, projectedTotal),
    minimumRequired,
    maxMisses,
    reachable,
    projectedMeetsTarget,
    scenarios: {
      allAttend: {
        present: allAttendPresent,
        total: projectedTotal,
        percentage: percentage(allAttendPresent, projectedTotal),
      },
      recordedRate: total
        ? {
            expectedPresent: present + (present / total) * remaining,
            total: projectedTotal,
            percentage: percentage(present, total),
          }
        : null,
    },
  };
}
