// ---------------------------------------------------------------------------
// Turn raw Brightspace JSON into the small, tidy objects the UI renders.
// Keeping this separate from the fetching code makes it easy to tweak how
// grades are interpreted without touching any networking.
// ---------------------------------------------------------------------------

import { GRADE_OBJECT_TYPE } from './brightspace.js';

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/** Points -> percentage, or null if it can't be computed. */
function pointsToPercent(numerator, denominator) {
  return isNum(numerator) && isNum(denominator) && denominator > 0 ? (numerator / denominator) * 100 : null;
}

/**
 * Pull a percentage and a letter/scheme symbol out of DisplayedGrade.
 * Brightspace formats this however the instructor configured it, e.g.
 * "92.5 %", "A-", "B+ (88 %)", or "17 / 20".
 */
export function parseDisplayedGrade(displayed) {
  const text = String(displayed ?? '').trim();
  if (!text) return { percent: null, letter: null };

  const pctMatch = text.match(/(-?\d+(?:[.,]\d+)?)\s*%/);
  const percent = pctMatch ? parseFloat(pctMatch[1].replace(',', '.')) : null;

  // Whatever is left after removing the percentage, points ("17 / 20") and
  // brackets is treated as the letter grade / scheme symbol.
  const rest = text
    .replace(/(-?\d+(?:[.,]\d+)?)\s*%/g, '')
    .replace(/-?\d+(?:[.,]\d+)?\s*\/\s*-?\d+(?:[.,]\d+)?/g, '')
    .replace(/[()[\]]/g, '')
    .trim();
  const letter = rest && !/^[-\d.,\s]+$/.test(rest) && rest.length <= 24 ? rest : null;

  return { percent, letter };
}

/**
 * Summarise a final-grade GradeValue into { status, percent, letter, ... }.
 * Prefers points (exact) over the formatted text, falls back to weighted values.
 */
export function summarizeFinalGrade(gv) {
  if (!gv) return unavailable('No final grade released yet.');
  const parsed = parseDisplayedGrade(gv.DisplayedGrade);
  const percent =
    pointsToPercent(gv.PointsNumerator, gv.PointsDenominator) ??
    pointsToPercent(gv.WeightedNumerator, gv.WeightedDenominator) ??
    parsed.percent;

  if (percent == null && !parsed.letter) return unavailable('No final grade released yet.');
  return {
    status: 'ok',
    percent,
    letter: parsed.letter,
    displayed: gv.DisplayedGrade || null,
    numerator: isNum(gv.PointsNumerator) ? gv.PointsNumerator : null,
    denominator: isNum(gv.PointsDenominator) ? gv.PointsDenominator : null,
  };
}

/** Normalise one item from myGradeValues. */
export function normalizeGradeItem(gv) {
  const parsed = parseDisplayedGrade(gv.DisplayedGrade);
  const type = gv.GradeObjectType;
  return {
    id: gv.GradeObjectIdentifier,
    name: gv.GradeObjectName || 'Untitled item',
    type,
    typeName: gv.GradeObjectTypeName || '',
    isCategory: type === GRADE_OBJECT_TYPE.CATEGORY,
    numerator: isNum(gv.PointsNumerator) ? gv.PointsNumerator : null,
    denominator: isNum(gv.PointsDenominator) ? gv.PointsDenominator : null,
    percent: pointsToPercent(gv.PointsNumerator, gv.PointsDenominator) ?? parsed.percent,
    letter: parsed.letter,
    displayed: gv.DisplayedGrade || '',
    // Only filled in for weighted gradebooks. WeightedDenominator is how much
    // the item counts toward the final grade; WeightedNumerator is what you earned of it.
    weightEarned: isNum(gv.WeightedNumerator) ? gv.WeightedNumerator : null,
    weight: isNum(gv.WeightedDenominator) ? gv.WeightedDenominator : null,
    feedback: (gv.Comments?.Text || '').trim(),
  };
}

/** Normalise the whole myGradeValues list, dropping the final-grade rows. */
export function normalizeGradeItems(list) {
  return (Array.isArray(list) ? list : [])
    .filter((gv) => gv && gv.GradeObjectType !== GRADE_OBJECT_TYPE.FINAL_CALCULATED && gv.GradeObjectType !== GRADE_OBJECT_TYPE.FINAL_ADJUSTED)
    .map(normalizeGradeItem);
}

/** A "Not available" result, with a reason shown as a tooltip / detail line. */
export function unavailable(reason) {
  return { status: 'unavailable', reason };
}

/** Explain why a grade request failed in plain words. */
export function describeFailure(err) {
  if (err?.status === 403) return 'Hidden or not released by the instructor.';
  if (err?.status === 404) return 'Not set up or not released for this course.';
  return err?.message || 'Could not load.';
}

/**
 * Decide whether an enrollment is a current course, an old one, or not
 * started yet. Uses the course's active flag plus its start/end dates.
 * @returns {'current' | 'past' | 'upcoming'}
 */
export function classifyEnrollment(access, now = Date.now()) {
  const start = access?.StartDate ? Date.parse(access.StartDate) : null;
  const end = access?.EndDate ? Date.parse(access.EndDate) : null;
  if (end && end < now) return 'past';
  if (start && start > now) return 'upcoming';
  if (access && access.IsActive === false) return 'past';
  return 'current';
}

/** Shape a raw enrollment into the course object we store. */
export function toCourse(enrollment, now = Date.now()) {
  const ou = enrollment.OrgUnit || {};
  const access = enrollment.Access || {};
  return {
    id: ou.Id,
    name: ou.Name || `Course ${ou.Id}`,
    code: ou.Code || '',
    homeUrl: ou.HomeUrl || null,
    startDate: access.StartDate || null,
    endDate: access.EndDate || null,
    lastAccessed: access.LastAccessed || null,
    period: classifyEnrollment(access, now),
  };
}
