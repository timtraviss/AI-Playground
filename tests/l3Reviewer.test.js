import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratingLabel, buildMarkdownReport } from '../server/lib/l3ReportGenerator.js';

// ratingLabel tests
test('ratingLabel(5) → Excellent', () => assert.equal(ratingLabel(5), 'Excellent'));
test('ratingLabel(4) → Good', () => assert.equal(ratingLabel(4), 'Good'));
test('ratingLabel(3) → Okay', () => assert.equal(ratingLabel(3), 'Okay'));
test('ratingLabel(2) → Poor', () => assert.equal(ratingLabel(2), 'Poor'));
test('ratingLabel(1) → Very Poor', () => assert.equal(ratingLabel(1), 'Very Poor'));

// buildMarkdownReport tests — use these exact mock objects:
const MOCK_FORM = {
  dateOfInterview: '2026-04-14',
  reasonForInterview: 'Assault',
  fileNumber: '2026-001',
  lengthMinutes: '45',
  interviewerName: 'Det. Smith',
  interviewerQid: 'Q12345',
  interviewerSection: 'CIB',
  interviewerSupervisor: 'Sgt. Jones',
  wellcheckAcknowledged: 'Yes',
  firstTimeAccreditation: 'No',
  assessorName: 'Det. Brown',
  assessorQid: 'Q99999',
  dateEvaluated: '2026-04-15',
  dateFeedbackGiven: '2026-04-16',
  intervieweeName: 'Jane Doe',
  intervieweeGender: 'Female',
  specialConsiderations: ['None'],
  otherPersonsPresent: ['None'],
  supportingDocuments: ['Transcript (only if completed)'],
  planningNotes: 'Reviewed case file',
  detailedKnowledge: 'Yes',
  planningComments: 'Well prepared',
  enquiriesIdentified: 'Follow up on location',
  whatWentWell: 'Built good rapport',
  learningPoints: 'Use more open questions',
  assessorPositiveFeedback: 'Strong rapport',
  assessorLearningPoints: 'Avoid leading questions',
  learningDevelopmentPlan: '',
};

const MOCK_REVIEW = {
  section5: {
    checklist: [
      { item: 'Set up room appropriately', result: 'Yes', comment: '' },
      { item: 'State time/date', result: 'Yes', comment: '' },
    ],
    rating: 4,
    ratingLabel: 'Good',
  },
  section6: {
    checklist: [
      { item: 'Not interrupt free recall (FR)', result: 'Yes', comment: '' },
    ],
    rating: 3,
    ratingLabel: 'Okay',
  },
  section7: {
    items: [
      { item: 'Open questions', frequency: 'Often', comment: '' },
      { item: 'Leading or other unproductive', frequency: 'Never', comment: '' },
    ],
    rating: 5,
    ratingLabel: 'Excellent',
  },
  section8: {
    checklist: [
      { item: 'Give the witness the opportunity to add anything', result: 'Yes', comment: '' },
    ],
  },
  verdict: 'COMPETENT',
  narrativeSummary: 'A solid interview demonstrating good technique.',
  strengths: ['Good rapport', 'Effective free recall'],
  learningPoints: ['Reduce closed questions'],
  aiSuggestedFeedback: {
    positive: 'You built strong rapport.',
    learning: 'Consider using more open questions.',
  },
};

test('buildMarkdownReport includes verdict', () => {
  const md = buildMarkdownReport(MOCK_FORM, MOCK_REVIEW);
  assert.ok(md.includes('COMPETENT'), 'should include verdict');
});
test('buildMarkdownReport includes interviewer name', () => {
  const md = buildMarkdownReport(MOCK_FORM, MOCK_REVIEW);
  assert.ok(md.includes('Det. Smith'), 'should include interviewer name');
});
test('buildMarkdownReport includes section 5 rating', () => {
  const md = buildMarkdownReport(MOCK_FORM, MOCK_REVIEW);
  assert.ok(md.includes('4/5') || md.includes('Good'), 'should include section 5 rating');
});
test('buildMarkdownReport includes strengths', () => {
  const md = buildMarkdownReport(MOCK_FORM, MOCK_REVIEW);
  assert.ok(md.includes('Good rapport'), 'should include strength');
});
test('buildMarkdownReport returns a non-empty string', () => {
  const md = buildMarkdownReport(MOCK_FORM, MOCK_REVIEW);
  assert.equal(typeof md, 'string');
  assert.ok(md.length > 100, 'should be substantial content');
});
