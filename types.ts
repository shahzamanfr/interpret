export enum CoachMode {
  Teacher = 'Teacher',
  Debater = 'Debater',
  Storyteller = 'Storyteller',
}

export interface CommunicationBehavior {
  profile: string;
  strength: string;
  growthArea: string;
}

export interface ExampleRewrite {
  original: string;
  improved: string;
  reasoning: string;
}

export interface DebateAnalysis {
  strongestArgument: string;
  weakestArgument: string;
  bestRebuttal: string;
  missedOpportunities: string;
  improvementOverTime: string;
}

export interface TeachingAnalysis {
  strongestMoment: string;
  weakestMoment: string;
  bestExplanation: string;
  missedOpportunities: string;
  audienceAdaptation: string;
}

export interface StorytellingAnalysis {
  strongestMoment: string;
  weakestMoment: string;
  bestTechnique?: string;
  missedOpportunities?: string;
  emotionalConnection?: string;
  sensoryDetails?: string;
  conflictAnalysis?: string;
  themeAndSubtext?: string;
}

export interface GroupDiscussionAnalysis {
  strongestContribution: string;
  weakestContribution: string;
  bestInteraction: string;
  missedOpportunities: string;
  groupDynamics: string;
}

export interface CategoryScores {
  clarity: number;
  vocabulary: number;
  grammar: number;
  logic: number;
  fluency: number;
  creativity: number;
  // Debate-specific categories
  argumentStrength?: number;
  evidenceSupport?: number;
  logicalReasoning?: number;
  rebuttalEffectiveness?: number;
  persuasionImpact?: number;
  engagementResponsiveness?: number;
  // Teacher-specific categories
  structure?: number;
  engagement?: number;
  educationalValue?: number;
  accessibility?: number;
  completeness?: number;
  // Storyteller-specific categories
  narrativeStructure?: number;
  characterDevelopment?: number;
  descriptiveLanguage?: number;
  emotionalImpact?: number;
  showVsTell?: number;
  conflictAndStakes?: number;
  // Group Discussion-specific categories
  participation?: number;
  communication?: number;
  leadership?: number;
  listening?: number;
  collaboration?: number;
  criticalThinking?: number;
  // Legacy categories
  evidence?: number;
  emotional?: number;
  time?: number;
}

export interface Feedback {
  role: CoachMode;
  overall_score: number;
  category_scores: CategoryScores;
  feedback: string;
  tips: string[];
  // Legacy fields for backward compatibility
  score: number;
  whatYouDidWell: string;
  areasForImprovement: string;
  personalizedTip: string;
  spokenResponse: string;
  communicationBehavior: CommunicationBehavior;
  exampleRewrite: ExampleRewrite;
  // Role-specific analysis
  debateAnalysis?: DebateAnalysis;
  teachingAnalysis?: TeachingAnalysis;
  storytellingAnalysis?: StorytellingAnalysis;
  groupDiscussionAnalysis?: GroupDiscussionAnalysis;
  messageBreakdown?: any[];
}

export interface ScoreHistory {
  date: string;
  score: number;
  mode: CoachMode;
}

export interface DomainImage {
  id: string;
  src: string;
  alt: string;
}

export interface ImageDomain {
  slug: string;
  emoji: string;
  title: string;
  description: string;
  accentClass: string;
  imageAccentClass: string;
  images: DomainImage[];
}

export enum LoadingState {
  Idle = 'idle',
  GeneratingCaption = 'generating_caption',
  GeneratingFeedback = 'generating_feedback',
  Done = 'done',
  Error = 'error',
}

export enum InputMode {
  Image = 'image',
  Text = 'text',
}

export interface TextScenario {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  content: string; // Base64 encoded content
  extractedText?: string;
  mimeType: string;
}

export interface FileUploadState {
  files: UploadedFile[];
  isProcessing: boolean;
  error: string | null;
}