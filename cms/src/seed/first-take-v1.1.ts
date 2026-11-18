import type { Payload } from "payload";

export const FIRST_TAKE_SLUG = "first-take" as const;

export const FIRST_TAKE_CONTENT_TYPES = [
  "video",
  "photo",
  "caption",
  "story",
] as const;

export type FirstTakeContentType = (typeof FIRST_TAKE_CONTENT_TYPES)[number];
export type FirstTakeDayType = "push" | "protect" | "recharge";

type RichText = {
  root: {
    type: "root";
    children: Array<{
      type: "paragraph";
      children: Array<{
        type: "text";
        detail: number;
        format: number;
        mode: "normal";
        style: string;
        text: string;
        version: number;
      }>;
      direction: null;
      format: "";
      indent: number;
      version: number;
    }>;
    direction: null;
    format: "";
    indent: number;
    version: number;
  };
};

export interface FirstTakeResourceSpec {
  slug: string;
  title: string;
  description: string;
  referencedDays: number[];
  lessonSlug: string;
  sourceReference: string;
}

export interface FirstTakeLessonSpec {
  slug: string;
  title: string;
  summary: string;
  moduleSlug: string;
  order: number;
  resourceSlugs: string[];
  sourceReference: string;
}

export interface FirstTakeModuleSpec {
  slug: string;
  title: string;
  order: number;
  dayNumber: number;
  overview: string;
  lessons: Array<Pick<FirstTakeLessonSpec, "slug" | "order">>;
  sourceReference: string;
}

export interface FirstTakeMilestoneSpec {
  name: string;
  triggerDay: number;
  copy: string;
  sourceReference: string;
}

export interface FirstTakeInsightMomentSpec {
  triggerType:
    | "day"
    | "task_completed"
    | "week_completed"
    | "three_consecutive_skipped_days";
  triggerCondition: string;
  copy: string;
  sourceTrigger: string;
  sourceReference: string;
}

export interface FirstTakeTaskSpec {
  slug: string;
  title: string;
  dayNumber: number;
  orderWithinDay: number;
  phase: string;
  milestone: string;
  dayType: FirstTakeDayType;
  timeEstimateMinutes: number;
  publishSlot: boolean;
  postNumber: number | null;
  contentType: FirstTakeContentType;
  moduleSlug: string;
  objective: string;
  openingLine: string;
  instruction: string;
  whyItMatters: string;
  output: string;
  pausePrompt: string;
  sourceReference: string;
}

export interface FirstTakeProgrammeSpec {
  slug: typeof FIRST_TAKE_SLUG;
  title: string;
  description: string;
  durationDays: number;
  experienceLevel: "beginner";
  difficulty: "easy";
  track: "starter";
  expectations: string;
  ctaText: string;
  sourceReference: string;
}

export interface FirstTakeV11Manifest {
  programme: FirstTakeProgrammeSpec;
  modules: FirstTakeModuleSpec[];
  lessons: FirstTakeLessonSpec[];
  resources: FirstTakeResourceSpec[];
  milestones: FirstTakeMilestoneSpec[];
  insightMoments: FirstTakeInsightMomentSpec[];
  tasks: FirstTakeTaskSpec[];
}

const SOURCE_DOC =
  "Google Doc: Contentual_First_Take_Programme_v1.1 (1qyI0hJr7dFidCJqVhmGDl_RkHEil3pKk56jbBihhtcM)";
const SOURCE_WORKBOOK =
  "Google Sheet: Contentual_First_Take_Task_Copy_v1.1 (16U8VSTZdpcB6wTt4D7ku-TouDmjP92LzsGsdCd9maik)";

function richText(...paragraphs: string[]): RichText {
  return {
    root: {
      type: "root",
      children: paragraphs.map((text) => ({
        type: "paragraph" as const,
        children: [
          {
            type: "text" as const,
            detail: 0,
            format: 0,
            mode: "normal" as const,
            style: "",
            text,
            version: 1,
          },
        ],
        direction: null,
        format: "" as const,
        indent: 0,
        version: 1,
      })),
      direction: null,
      format: "",
      indent: 0,
      version: 1,
    },
  };
}

const moduleSlugsByDay = new Map<number, string>([
  [1, "platform-literacy-101"],
  [2, "platform-literacy-101"],
  [3, "platform-literacy-101"],
  [4, "hooks-storytelling-first-take"],
  [5, "hooks-storytelling-first-take"],
  [6, "hooks-storytelling-first-take"],
  [7, "hooks-storytelling-first-take"],
  [8, "hooks-storytelling-first-take"],
  [9, "finding-what-works-in-your-niche"],
  [10, "finding-what-works-in-your-niche"],
  [11, "finding-what-works-in-your-niche"],
  [12, "finding-what-works-in-your-niche"],
  [13, "packaging-your-content"],
  [14, "packaging-your-content"],
  [15, "reading-your-numbers-without-panicking"],
  [16, "reading-your-numbers-without-panicking"],
  [17, "reading-your-numbers-without-panicking"],
  [18, "reading-your-numbers-without-panicking"],
  [19, "building-your-content-system"],
  [20, "building-your-content-system"],
  [21, "building-your-content-system"],
]);

const writtenPlanningDays = new Set([1, 2, 3, 5, 8, 16]);

interface TaskSource {
  dayNumber: number;
  phase: string;
  dayType: FirstTakeDayType;
  milestone: string;
  title: string;
  timeEstimateMinutes: number;
  publishSlot: boolean;
  postNumber: number | null;
  objective: string;
  openingLine: string;
  instruction: string;
  whyItMatters: string;
  output: string;
  pausePrompt: string;
}

const taskSources: TaskSource[] = [
  {
    dayNumber: 1,
    phase: "Phase 1",
    dayType: "protect",
    milestone: "M1 Build",
    title: "Your Platform Foundations",
    timeEstimateMinutes: 45,
    publishSlot: false,
    postNumber: null,
    objective:
      "Understand how your chosen platform works before you make anything for it.",
    openingLine:
      "Before you make anything, understand the platform you are making it for. Most beginners skip this. Do not.",
    instruction:
      "Complete The Studio module: Platform Literacy 101. Two lessons. After both lessons write down three observations about your platform in your Planning notes. What does it reward. What does it punish. What does the content that performs best have in common.",
    whyItMatters:
      "Making content for a platform you do not understand is like cooking a meal without knowing who you are feeding. The platform has specific rules about what gets seen and what does not. Knowing those rules before Day 2 means every decision from here is informed, not guessed.",
    output: "Three written observations about your platform saved in Planning notes.",
    pausePrompt:
      "None on Protect days. The lesson and observation exercise is the reflection.",
  },
  {
    dayNumber: 2,
    phase: "Phase 1",
    dayType: "push",
    milestone: "M1 Build",
    title: "Your Content Compass",
    timeEstimateMinutes: 30,
    publishSlot: false,
    postNumber: null,
    objective:
      "Define exactly what you are creating, who it is for, and why they should care. One sentence. Saved permanently.",
    openingLine:
      "Before you film anything, you need to know what you stand for. Not in a grand philosophical way. Just one sentence that answers three questions.",
    instruction:
      "Answer these three questions in writing. What do you make. Who is it for. Why does it matter to them. Then combine your three answers into one sentence. That sentence is your content compass. Save it as a card in your Planning section. It does not change until this programme ends.",
    whyItMatters:
      "Every content decision you make from here gets easier when you have this sentence. It is a filter. Without it every idea looks equally valid and you will freeze every time you try to plan.",
    output: "One sentence saved as a Content Compass Card in the Planning section.",
    pausePrompt:
      "Could you talk about this topic for the next six months without running out of things to say?",
  },
  {
    dayNumber: 3,
    phase: "Phase 1",
    dayType: "push",
    milestone: "M1 Complete",
    title: "Your Three Content Pillars",
    timeEstimateMinutes: 30,
    publishSlot: false,
    postNumber: null,
    objective:
      "Turn your content compass into three specific content categories that every piece of content will sit inside.",
    openingLine:
      "Your compass tells you the direction. Your pillars are the three lanes you drive in.",
    instruction:
      "Based on your content compass, define three content pillars. Every piece of content you make in this programme sits inside one of them. Rules: no pillar broader than two words. Each pillar specific enough that a stranger could look at your content and know which pillar it belongs to. Save all three as your Pillars Board in Planning alongside your Compass Card.",
    whyItMatters:
      "Pillars stop you from jumping all over the place, which is one of the fastest ways to confuse an algorithm and lose an audience. They also give you a content planning shortcut: when you sit down to plan a batch you do not start from zero, you start from three.",
    output:
      "Three content pillars saved in the Pillars Board in Planning. Named, described in one sentence each.",
    pausePrompt:
      "If someone followed you only for Pillar 1, would they still find Pillars 2 and 3 relevant to their life?",
  },
  {
    dayNumber: 4,
    phase: "Phase 1",
    dayType: "protect",
    milestone: "M2 Build",
    title: "Hooks, Storytelling and Your First Take",
    timeEstimateMinutes: 90,
    publishSlot: false,
    postNumber: null,
    objective:
      "Learn the science of hooks and storytelling structure. Apply it immediately in two private practice takes on camera.",
    openingLine:
      "Today is a longer session. Block out 90 minutes. You are going to learn something and then immediately do it, which is the fastest way to make the learning stick.",
    instruction:
      "Complete The Studio module: Hooks, Storytelling and Your First Take. Three lessons. After all three lessons: film two practice hooks back to back on camera using a different hook formula for each take. Watch both back immediately and score each against the four-point framework: Hook, Clarity, Energy, Finish. For every Not Yet write one sentence on what you would change. This footage stays private. It never leaves the app.",
    whyItMatters:
      "The first time most people hear their own voice on camera they are so distracted by how they sound that they cannot evaluate anything useful. Getting that shock out of the way privately means your Day 6 filming session is a second exposure, not a first. Second exposures are dramatically less frightening.",
    output:
      "Two practice tapes scored against four-point framework. Notes saved in Planning. Footage stored privately in app vault. Never published.",
    pausePrompt:
      "None on Protect days. The practice tape and self-review is the reflection.",
  },
  {
    dayNumber: 5,
    phase: "Phase 1",
    dayType: "push",
    milestone: "M2 Build",
    title: "Script Your Batch One Content",
    timeEstimateMinutes: 45,
    publishSlot: false,
    postNumber: null,
    objective:
      "Write a script skeleton for each of your three Batch One pieces using what you now know about hooks, storytelling, and your own on-camera style.",
    openingLine:
      "No camera today. Today you prepare. Tomorrow you film with intention instead of hope.",
    instruction:
      "Using your three content pillars, your content compass, and what you learned about yourself on camera yesterday, write a script skeleton for each of your three Batch One pieces. One piece per pillar. Four-element structure: opening hook (exact first sentence word for word), setup (2-3 sentences), main point (3-5 sentences), close (1 sentence). Use the downloadable script template in The Studio. Each script fits on half a page. If it does not fit, it is too long.",
    whyItMatters:
      "Creators who script before they film produce content that is more structured, more watchable, and faster to edit. You are not writing a performance script. You are writing a map. You know every turning before the journey starts.",
    output:
      "Three script skeletons saved in Planning. One per pillar. Using the Studio script template.",
    pausePrompt: "Which of the three scripts excites you most to film? Start with that one tomorrow.",
  },
  {
    dayNumber: 6,
    phase: "Phase 1",
    dayType: "push",
    milestone: "M2 Complete",
    title: "Film Batch One",
    timeEstimateMinutes: 90,
    publishSlot: false,
    postNumber: null,
    objective:
      "Film all three Batch One pieces back to back in one session using the Day 5 scripts.",
    openingLine:
      "Filming day. This is the first time you film with a real hook, a real structure, and a real sense of who you are making this for. That is a different thing to just turning the camera on.",
    instruction:
      "Set up your filming space. Check lighting and background are consistent across all three pieces. Start with the script that excited you most on Day 5. Film all three pieces back to back. Do not stop to edit. Do not review footage between takes. One session. Three pieces. Multiple takes are fine. The goal is footage you can work with, not a perfect performance. Do not edit today.",
    whyItMatters:
      "Batching keeps creative energy consistent across all three pieces. If you film one piece today and one next week they will feel like they come from two different people. One session, same energy, same setup, same voice.",
    output: "Three pieces of footage filmed and saved. Ready for Day 7 self-review.",
    pausePrompt: "What felt different about filming with a script compared to the practice takes on Day 4?",
  },
  {
    dayNumber: 7,
    phase: "Phase 1",
    dayType: "recharge",
    milestone: "M3 + M4",
    title: "Self-Review + First Publish",
    timeEstimateMinutes: 75,
    publishSlot: true,
    postNumber: 1,
    objective:
      "Watch all three Batch One pieces back using the four-point framework. Pick the strongest. Edit it lightly and publish your first live post.",
    openingLine:
      "Two things happen today. You review what you made. Then you put the best one out into the world. The review comes first. Do not rush it to get to the publish.",
    instruction:
      "Part one: Watch each of your three Batch One pieces back once in full without stopping. Score each against the four-point framework: Hook, Clarity, Energy, Finish. For every Not Yet write one sentence on what you would change. Pick your strongest piece. Save review notes in Planning. Part two: Take your strongest piece. Light edit only - cut dead air at start and end, add captions if your platform uses them. Write your caption or title using a hook formula from Day 4. Publish it. Do not go back and change it after it goes live.",
    whyItMatters:
      "The self-review is not a hurdle before the publish. It is the coaching step that makes the publish intentional. You are not posting and hoping. You are posting with a specific piece you chose for a specific reason. That is already different to how most beginners operate.",
    output:
      "Self-review notes for all three pieces saved in Planning. Live Post 1 published. Publish timestamp logged in app.",
    pausePrompt: "How did hitting publish actually feel compared to how you imagined it would?",
  },
  {
    dayNumber: 8,
    phase: "Phase 2",
    dayType: "push",
    milestone: "M5 Build",
    title: "Prepare for Niche Research",
    timeEstimateMinutes: 30,
    publishSlot: false,
    postNumber: null,
    objective:
      "Before tomorrow's research module, understand what you are looking for and why. Set up your research environment.",
    openingLine:
      "Tomorrow you learn how to research your niche properly. Today you prepare so the lesson lands with context rather than theory.",
    instruction:
      "Open your platform and spend 20 minutes consuming content in your niche as a creator, not a viewer. Do not scroll passively. Pay attention to what stops you. What hooks make you watch past the first three seconds. Note three pieces that made you think: I wish I had made that. Save the links in your Planning notes with one word on why each one caught you. This pre-research activates the right questions before the module tomorrow.",
    whyItMatters:
      "Learning about research techniques is twice as effective when you already have a specific question the research is trying to answer. Day 8 gives you that question before Day 9 gives you the method.",
    output: "Three content examples saved in Planning with one-word observation each. Ready for Day 9 module.",
    pausePrompt: "What is the one thing those three pieces had in common that made you stop scrolling?",
  },
  {
    dayNumber: 9,
    phase: "Phase 2",
    dayType: "protect",
    milestone: "M5 Build",
    title: "Finding What Works in Your Niche",
    timeEstimateMinutes: 45,
    publishSlot: true,
    postNumber: 2,
    objective:
      "Learn how to research viral outlier content in your niche and build a research habit that feeds every future batch.",
    openingLine:
      "The creators who grow consistently are not just creative. They are also researchers. Today you learn how to do both.",
    instruction:
      "Complete The Studio module: Finding What Works in Your Niche. Two lessons. After both lessons: open your platform and find five pieces of content in your niche that performed significantly better than average for that creator at a similar stage to you. Write down the topic, the hook opening, and one thing you think made it work. Save as your Niche Research List in Planning. This list feeds your Batch Two planning on Day 10. Then publish Live Post 2: take your second Batch One piece, edit lightly, apply one improvement from today's research to the caption or hook, and publish.",
    whyItMatters:
      "Most beginners create from instinct alone. That is fine at the start but it is slow. Researching what works in your niche gives you a shortcut: proven hook formats, proven topic angles, proven structures already tested by the algorithm. You are not copying. You are learning from evidence.",
    output:
      "Niche Research List saved in Planning. Five content examples with topic, hook, and one observation each. Live Post 2 published.",
    pausePrompt: "None on Protect days. The research output is the reflection.",
  },
  {
    dayNumber: 10,
    phase: "Phase 2",
    dayType: "push",
    milestone: "M5 Build",
    title: "Plan and Script Batch Two",
    timeEstimateMinutes: 60,
    publishSlot: true,
    postNumber: 3,
    objective:
      "Use your niche research to plan five new pieces of content. Script all five before filming.",
    openingLine:
      "Planning day. You are building Batch Two today and you are not starting from a blank canvas. You have three pillars, a niche research list, and two published posts worth of experience behind you.",
    instruction:
      "Plan five new pieces of content for Batch Two. At least two pieces should be directly inspired by proven hook formats from your Day 9 research. One piece per pillar minimum. Write a script skeleton for each piece using the four-element structure. Hook, setup, main point, close. Half a page per script. Save all five in Planning. Then publish Live Post 3: take your third Batch One piece, edit lightly, apply one improvement from Day 9 research to caption or hook, and publish.",
    whyItMatters:
      "Planning and publishing on the same day works here because publishing requires a light edit and caption write only. The creative load is planning, not production. You are thinking and publishing, not filming and publishing.",
    output: "Five Batch Two scripts saved in Planning. Live Post 3 published.",
    pausePrompt: "How is planning content today different from how you planned it on Day 5?",
  },
  {
    dayNumber: 11,
    phase: "Phase 2",
    dayType: "push",
    milestone: "M5 Build",
    title: "Film Batch Two",
    timeEstimateMinutes: 120,
    publishSlot: false,
    postNumber: null,
    objective:
      "Film all five Batch Two pieces in one session using the scripts from Day 10. Allow two hours.",
    openingLine:
      "Filming day. Five pieces today. That is more than last time. You have done this before though. The session will feel faster than Day 6 because you know the process now.",
    instruction:
      "LONGER SESSION TODAY: Block out two hours. Set up your filming space exactly as you did for Batch One. Same background, same lighting. Film all five pieces back to back using your Day 10 scripts. Multiple takes are fine. Keep moving forward. Do not stop to review footage between takes. When you are done save all footage. Do not edit today.",
    whyItMatters:
      "Five pieces in one session is not too many. It is efficient. Every piece you make in this session costs you the same setup time. Filming one piece at a time means doing that setup 15 times over the programme instead of three. Batching is the professional workflow.",
    output: "Five Batch Two pieces filmed and saved. Ready for editing across Days 14 and beyond.",
    pausePrompt: "Which of the five pieces do you think will perform best and why?",
  },
  {
    dayNumber: 12,
    phase: "Phase 2",
    dayType: "recharge",
    milestone: "M5 Complete",
    title: "Your First Data Look",
    timeEstimateMinutes: 30,
    publishSlot: true,
    postNumber: 4,
    objective: "Open your analytics for all three published posts. Write down three specific numbers. Nothing more.",
    openingLine:
      "Data day. Not analysis day. Not conclusion day. Just the first time you open the dashboard and look at what is there.",
    instruction:
      "Open your analytics dashboard. Find three numbers only for each published post: total views or plays, watch time percentage or average view duration, and your top engagement action. Write all three numbers down for each post in Planning notes. Do not compare yourself to other creators. Do not judge the numbers as good or bad. You do not have enough posts yet to draw meaningful conclusions. Then publish Live Post 4: take your first Batch Two piece, edit lightly using hook formula from Day 4 for caption, and publish.",
    whyItMatters:
      "Avoiding your analytics does not make the numbers better. It just means you are making decisions without information. The sooner you get comfortable looking at data, the sooner the data becomes useful.",
    output: "Analytics notes for Posts 1 to 3 saved in Planning. Live Post 4 published.",
    pausePrompt:
      "Looking at the three posts side by side, is there any difference in the numbers you can point to a specific decision to explain?",
  },
  {
    dayNumber: 13,
    phase: "Phase 2",
    dayType: "protect",
    milestone: "M6 Complete",
    title: "Packaging Your Content",
    timeEstimateMinutes: 45,
    publishSlot: true,
    postNumber: 5,
    objective: "Learn how thumbnails, titles, and captions work. Apply what you learn to a live post immediately.",
    openingLine:
      "You can make the best piece of content in your niche and nobody will see it if the packaging is wrong. Today you learn the packaging.",
    instruction:
      "Complete The Studio module: Packaging Your Content. Two lessons covering how thumbnails and titles work on long-form platforms and how captions and on-screen text work on short-form platforms. After both lessons: go back to one of your published posts and rewrite the caption or title using a technique from today. Note in Planning whether it changes performance over the next 48 hours. Then publish Live Post 5: take your second Batch Two piece, apply the packaging technique you just learned before publishing.",
    whyItMatters:
      "Packaging is the difference between content that gets clicked and content that gets ignored. Same piece, different title or thumbnail, completely different performance. You are applying what you learn the same day you learn it. That is when knowledge becomes skill.",
    output: "One existing post updated with improved packaging. Live Post 5 published with packaging applied. Notes on changes saved in Planning.",
    pausePrompt: "None on Protect days. The packaging application is the reflection.",
  },
  {
    dayNumber: 14,
    phase: "Phase 2",
    dayType: "push",
    milestone: "M7 Build",
    title: "Edit Batch Two",
    timeEstimateMinutes: 90,
    publishSlot: false,
    postNumber: null,
    objective: "Edit three pieces from Batch Two. Apply packaging techniques from Day 13 to all three. Save ready for publishing in Phase 3.",
    openingLine: "Edit session. Three pieces today. Getting them ready now means no scramble later in Phase 3.",
    instruction:
      "Edit three pieces from Batch Two. Apply what you learned about packaging on Day 13 to all three: titles or captions using a proven hook format, thumbnails if your platform uses them, captions or on-screen text if relevant. Do not over-edit. Cut dead air. Tighten pacing. Add captions. Save all three pieces as ready to publish.",
    whyItMatters:
      "Having three edited pieces sitting ready means Phase 3 never starts from zero. You are banking effort today that pays off across Days 15 to 19.",
    output: "Three Batch Two pieces edited, packaged, and saved ready to publish as Live Posts 6, 7 and 8.",
    pausePrompt: "Are you spending more time editing than filming? That ratio is worth noticing. Most creators should spend less time in edit, not more.",
  },
  {
    dayNumber: 15,
    phase: "Phase 3",
    dayType: "protect",
    milestone: "M7 Build",
    title: "Reading Your Numbers Without Panicking",
    timeEstimateMinutes: 45,
    publishSlot: true,
    postNumber: 6,
    objective: "Learn which three metrics actually matter for a beginner and why everything else is noise right now.",
    openingLine:
      "Data literacy day. Not because the numbers are everything. Because knowing which numbers to look at means you stop being distracted by the ones that do not matter yet.",
    instruction:
      "Complete The Studio module: Reading Your Numbers Without Panicking. Two lessons. After both lessons: open your analytics and identify your best performing post based on the primary metric for your platform. Write one sentence in Planning explaining why you think that post outperformed the others. One sentence. Specificity matters more than length. Then publish Live Post 6: this is the first of the three Batch Two pieces you edited on Day 14. Light check on caption then publish.",
    whyItMatters:
      "Most beginner creators look at the wrong numbers and draw the wrong conclusions. This lesson teaches you what to look for first so the data becomes useful rather than anxiety-inducing.",
    output: "One sentence in Planning explaining what made the best performing post work. Live Post 6 published.",
    pausePrompt: "None on Protect days. The analytics observation is the reflection.",
  },
  {
    dayNumber: 16,
    phase: "Phase 3",
    dayType: "push",
    milestone: "M7 Complete",
    title: "Your Full Content Audit",
    timeEstimateMinutes: 45,
    publishSlot: false,
    postNumber: null,
    objective: "Review all published posts using the analytics framework from Day 15. Find the pattern. Do not plan anything today.",
    openingLine: "Audit day. You are a coach watching their own training footage. The job is to see clearly, not to judge.",
    instruction:
      "Open your analytics and look at all published posts. For each post write three things in Planning: the hook you used, the view or play count, and one thing you would change if you made it again today. Then rank all posts from strongest to weakest based on your primary metric. At the bottom write one sentence completing this statement: my strongest post worked because it had something my weakest post did not, and that thing was blank. Do not plan your next batch today. Just look and think.",
    whyItMatters:
      "The gap between Day 15 and today is intentional. Day 15 introduces the framework. Today you apply it. There is a full day between seeing the data and acting on it because insight takes time to form. Acting on data the same day you see it usually produces reactive decisions rather than informed ones.",
    output: "Full content audit saved in Planning. All posts ranked. One insight sentence written.",
    pausePrompt: "What pattern do you see across your top three posts that was not visible when you looked at each one individually?",
  },
  {
    dayNumber: 17,
    phase: "Phase 3",
    dayType: "push",
    milestone: "M8 Build",
    title: "Plan and Script Batch Three",
    timeEstimateMinutes: 75,
    publishSlot: true,
    postNumber: 7,
    objective: "Use your Day 16 audit to plan seven new pieces. At least three must be data-informed iterations of your strongest posts.",
    openingLine: "Planning day. But this time you are not planning from instinct or from a research list alone. You are planning from your own data. That is a different and more powerful thing.",
    instruction:
      "Based on your Day 16 content audit, plan seven new pieces for Batch Three. Rules: at least three pieces must directly iterate on your strongest posts using the double-down principle. Keep the topic and change the format or angle. Keep the format and adjust the depth of the value. Or keep the topic and format and rewrite the hook. The remaining four pieces can be planned from your pillars and niche research as usual. Write a script skeleton for all seven using the four-element structure. Save all in Planning. Then publish Live Post 7: this is the second of the three Batch Two pieces edited on Day 14.",
    whyItMatters:
      "Iterating on what has already worked is not repetition. It is how every experienced creator grows. You are taking a proven signal and asking what else it can teach you.",
    output: "Seven Batch Three scripts saved in Planning. At least three are data-informed iterations. Live Post 7 published.",
    pausePrompt: "How different does planning feel now that you have real data and a research list to work from compared to Day 5?",
  },
  {
    dayNumber: 18,
    phase: "Phase 3",
    dayType: "push",
    milestone: "M8 Build",
    title: "Film Batch Three",
    timeEstimateMinutes: 150,
    publishSlot: false,
    postNumber: null,
    objective: "Film all seven Batch Three pieces in one session. Allow two and a half hours.",
    openingLine: "Your biggest filming day. Seven pieces. Block out two and a half hours. You have done this twice before. The process is familiar. The only variable today is execution.",
    instruction:
      "LONGER SESSION TODAY: Block out two and a half hours. Set up your filming space. Same setup as previous batches for visual consistency. Film all seven pieces in sequence using your Day 17 scripts. Take as many takes as needed on each piece. Keep moving forward. Do not review footage between pieces. When you are done, save all footage.",
    whyItMatters: "Seven pieces in one session means content ready to publish for weeks after this programme ends. That is the system working exactly as designed.",
    output: "Seven Batch Three pieces filmed and saved.",
    pausePrompt: "How long did this session take compared to your Day 6 Batch One session?",
  },
  {
    dayNumber: 19,
    phase: "Phase 3",
    dayType: "protect",
    milestone: "M8 Complete",
    title: "Building Your Content System",
    timeEstimateMinutes: 45,
    publishSlot: true,
    postNumber: 8,
    objective: "Learn how to build a simple weekly content workflow. Map your own sustainable system in the Planning section.",
    openingLine: "Today you build the thing that makes everything you have learned in this programme last beyond Day 21.",
    instruction:
      "Complete The Studio module: Building Your Content System. Two lessons covering how to design a simple weekly content workflow and how to schedule and space your published content for maximum consistency. After both lessons: map your own one-page weekly content schedule in the Planning section. Include your planned posting days, your batch session day each month, your research day, and your analytics check day. This schedule should be realistic for your actual life, not aspirational. Then publish Live Post 8: this is the third of the three Batch Two pieces edited on Day 14. Edit lightly if needed and publish.",
    whyItMatters: "A system is what separates creators who sustain from creators who burn out. Without a system every week starts from scratch. With a system the creative energy goes into the content, not the logistics.",
    output: "One-page weekly content schedule saved in Planning. Live Post 8 published.",
    pausePrompt: "None on Protect days. The system map is the reflection.",
  },
  {
    dayNumber: 20,
    phase: "Phase 3",
    dayType: "push",
    milestone: "M9 Build",
    title: "Edit Batch Three",
    timeEstimateMinutes: 120,
    publishSlot: false,
    postNumber: null,
    objective: "Edit five pieces from Batch Three. Apply all packaging knowledge. These become your programme finale posts and your ongoing bank.",
    openingLine: "Last big edit session. Five pieces today. Two go live tomorrow. Three stay in the bank for after the programme ends.",
    instruction:
      "LONGER SESSION TODAY: Block out two hours. Select your five strongest pieces from Batch Three based on script quality and instinct from the filming session. Edit all five: cut dead air, tighten pacing, add captions, write titles or captions using proven hook formats, add thumbnails if your platform uses them. Apply the full packaging process to all five. The remaining two Batch Three pieces stay unedited in your content bank, filed and labelled clearly.",
    whyItMatters: "Ending this programme with two unedited pieces already filmed and five edited pieces ready means the week after Day 21 has no pressure and no blank canvas. You already know what you are posting and you already have the footage.",
    output: "Five Batch Three pieces fully edited and ready. Two pieces saved unedited in content bank. Clearly labelled.",
    pausePrompt: "Compare this edit session to your Day 7 edit when you published your first post. What do you know now that you had no idea about then?",
  },
];

const day21Tasks: FirstTakeTaskSpec[] = [
  {
    slug: "first-take-day-21-forward-plan-and-post-9",
    title: "Write Your Forward Plan + Publish Post 9",
    dayNumber: 21,
    orderWithinDay: 1,
    phase: "Phase 3",
    milestone: "M9 Complete",
    dayType: "recharge",
    timeEstimateMinutes: 30,
    publishSlot: true,
    postNumber: 9,
    contentType: "video",
    moduleSlug: "building-your-content-system",
    objective: "Write your own 30-day content plan and publish your ninth post.",
    openingLine: "Last day. First, write down what comes next in your own words.",
    instruction:
      "Write your 30-day forward plan in the Planning section. Cover six things: your content compass in your own words, your three pillars with one sentence on each, your weekly posting rhythm with specific days, your next batch date within the next four weeks, your one metric to track for the next 30 days, and one creative goal to achieve by Day 52. Then publish Live Post 9, one of the five Batch Three pieces you edited on Day 20. Apply full packaging before publishing.",
    whyItMatters:
      "The 30-day forward plan converts the programme from a closed experience into an ongoing practice. Writing it before the finale publish turns the end of the programme into a deliberate next step.",
    output: "30-day forward plan saved in Planning. Live Post 9 published.",
    pausePrompt: "Optional: What is the one thing you know now that you wish you had known on Day 1?",
    sourceReference: `${SOURCE_WORKBOOK}, Task Copy row 21 (split 1 of 2)`,
  },
  {
    slug: "first-take-day-21-post-10-and-complete",
    title: "Publish Post 10 + Complete First Take",
    dayNumber: 21,
    orderWithinDay: 2,
    phase: "Phase 3",
    milestone: "M9 Complete",
    dayType: "recharge",
    timeEstimateMinutes: 30,
    publishSlot: true,
    postNumber: 10,
    contentType: "video",
    moduleSlug: "building-your-content-system",
    objective: "Publish your tenth post and complete the First Take programme.",
    openingLine: "The plan is written. Now send off the programme with the final post.",
    instruction:
      "Publish Live Post 10, one of the five Batch Three pieces you edited on Day 20. Edit any final details, apply full packaging, and publish. Mark the programme complete in the app.",
    whyItMatters:
      "The two finale posts mark the end of the programme with momentum rather than a passive stop. You started this programme having never posted with intention. You finish it having published ten times and written your own plan for what comes next.",
    output: "Live Post 10 published. Programme marked complete in app.",
    pausePrompt: "Optional: What is the one thing you know now that you wish you had known on Day 1?",
    sourceReference: `${SOURCE_WORKBOOK}, Task Copy row 21 (split 2 of 2)`,
  },
];

const scheduleTasks: FirstTakeTaskSpec[] = taskSources.map((source) => ({
  ...source,
  slug: `first-take-day-${String(source.dayNumber).padStart(2, "0")}`,
  orderWithinDay: 1,
  contentType: writtenPlanningDays.has(source.dayNumber) ? "caption" : "video",
  moduleSlug:
    moduleSlugsByDay.get(source.dayNumber) ?? "building-your-content-system",
  sourceReference: `${SOURCE_WORKBOOK}, Task Copy row ${source.dayNumber}`,
}));

export const firstTakeV11Manifest: FirstTakeV11Manifest = {
  programme: {
    slug: FIRST_TAKE_SLUG,
    title: "First Take",
    description:
      "First Take is the entry point to Contentual. It is designed for someone who has thought about starting to post content for months but has never done it with intention.",
    durationDays: 21,
    experienceLevel: "beginner",
    difficulty: "easy",
    track: "starter",
    expectations:
      "Complete Beginner. Never posted with intention. Zero to two accidental posts maximum. Expect 30 to 150 minutes per day. The first real filming session is Day 6, the first live publish is Day 7, and the programme ends with ten published posts and a 30-day forward plan. Anyone who has posted consistently for more than four weeks should use 30-Day Foundations instead.",
    ctaText: "Start First Take",
    sourceReference: `${SOURCE_DOC}, What This Programme Is and Who This Programme Is For`,
  },
  modules: [
    {
      slug: "platform-literacy-101",
      title: "Platform Literacy 101",
      order: 1,
      dayNumber: 1,
      overview:
        "Teaches the user how their chosen platform works before they create anything for it. Covers discovery versus reach mechanics, what the algorithm rewards in the first 30 days, and how to look at the platform as a creator rather than a consumer. Platform-specific versions are required for YouTube, Instagram, TikTok, and LinkedIn.",
      lessons: [
        { slug: "platform-how-your-platform-works", order: 1 },
        { slug: "platform-discovery-vs-reach", order: 2 },
      ],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules row M1`,
    },
    {
      slug: "hooks-storytelling-first-take",
      title: "Hooks, Storytelling and Your First Take",
      order: 2,
      dayNumber: 4,
      overview:
        "Most critical module in First Take. It teaches hook science and storytelling structure, then immediately puts both into practice through two private workshop takes on camera. The user tests hooks on camera twice and reviews the result against a specific framework before filming real content.",
      lessons: [
        { slug: "what-a-hook-is", order: 1 },
        { slug: "four-hook-formulas", order: 2 },
        { slug: "storytelling-structure", order: 3 },
      ],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules row M2`,
    },
    {
      slug: "finding-what-works-in-your-niche",
      title: "Finding What Works in Your Niche",
      order: 3,
      dayNumber: 9,
      overview:
        "Teaches the research habit that separates creators who grow consistently from those who rely on instinct alone. Covers how to identify viral outlier content within a specific niche, what to look for when analysing performance, and how to iterate off proven formats without copying.",
      lessons: [
        { slug: "find-viral-outlier-content", order: 1 },
        { slug: "iterate-without-copying", order: 2 },
      ],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules row M3`,
    },
    {
      slug: "packaging-your-content",
      title: "Packaging Your Content",
      order: 4,
      dayNumber: 13,
      overview:
        "Teaches how packaging — title, thumbnail, caption, and on-screen text — often determines performance more than the content itself. The user applies packaging techniques to their own published and unpublished content.",
      lessons: [
        { slug: "thumbnails-and-titles", order: 1 },
        { slug: "captions-and-on-screen-text", order: 2 },
      ],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules row M4`,
    },
    {
      slug: "reading-your-numbers-without-panicking",
      title: "Reading Your Numbers Without Panicking",
      order: 5,
      dayNumber: 15,
      overview:
        "Introduces basic analytics literacy after five posts are live. It teaches which three metrics matter for a beginner on their specific platform, why everything else is noise at this stage, and how to spot patterns without drawing premature conclusions from small data sets.",
      lessons: [
        { slug: "three-metrics-for-a-beginner", order: 1 },
        { slug: "spotting-what-is-working", order: 2 },
      ],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules row M5`,
    },
    {
      slug: "building-your-content-system",
      title: "Building Your Content System",
      order: 6,
      dayNumber: 19,
      overview:
        "Final module in First Take. It teaches a simple, sustainable weekly content workflow, formalises the batch production model used throughout the programme, and produces the weekly schedule that feeds into the Day 21 forward plan.",
      lessons: [
        { slug: "designing-your-weekly-workflow", order: 1 },
        { slug: "scheduling-and-spacing-content", order: 2 },
      ],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules row M6`,
    },
  ],
  lessons: [
    {
      slug: "platform-how-your-platform-works",
      title: "How Your Platform Works",
      summary:
        "Core mechanics, how content gets discovered versus reaching existing followers, what the algorithm looks for in the first 30 days, and why posting frequency and completion rate matter more than production quality at this stage.",
      moduleSlug: "platform-literacy-101",
      order: 1,
      resourceSlugs: [],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M1 lesson 1`,
    },
    {
      slug: "platform-discovery-vs-reach",
      title: "Discovery Content vs Reach Content",
      summary:
        "The difference between content designed to find new audiences versus deepen existing relationships. Why beginners should prioritise discovery first, and how to identify whether a piece is working for discovery or reach using three specific signals.",
      moduleSlug: "platform-literacy-101",
      order: 2,
      resourceSlugs: [],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M1 lesson 2`,
    },
    {
      slug: "what-a-hook-is",
      title: "What a Hook Is and Why It Decides Everything",
      summary:
        "Definition, why the first three seconds determine watch or scroll, average scroll speed, and why a weak hook makes strong content invisible.",
      moduleSlug: "hooks-storytelling-first-take",
      order: 1,
      resourceSlugs: ["hook-formula-cheatsheet"],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M2 lesson 1`,
    },
    {
      slug: "four-hook-formulas",
      title: "The Four Hook Formulas",
      summary:
        "Four hook structures that work on any platform: bold claim, question that creates tension, unexpected statement, and story open. Includes worked examples and fill-in-the-blank templates.",
      moduleSlug: "hooks-storytelling-first-take",
      order: 2,
      resourceSlugs: ["hook-formula-cheatsheet", "script-skeleton-template"],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M2 lesson 2`,
    },
    {
      slug: "storytelling-structure",
      title: "Storytelling Structure That Makes People Stay",
      summary:
        "Setup-conflict-resolution structure, open loops, and how to end a piece so viewers take an action.",
      moduleSlug: "hooks-storytelling-first-take",
      order: 3,
      resourceSlugs: ["four-point-self-review-framework"],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M2 lesson 3`,
    },
    {
      slug: "find-viral-outlier-content",
      title: "How to Find Viral Outlier Content in Your Niche",
      summary:
        "How to find outlier content on each platform using search strategies, hashtag analysis, and creator comparison. Covers topic angle, hook structure, format length, visual style, and comment sentiment.",
      moduleSlug: "finding-what-works-in-your-niche",
      order: 1,
      resourceSlugs: ["niche-research-list-template"],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M3 lesson 1`,
    },
    {
      slug: "iterate-without-copying",
      title: "How to Iterate Without Copying",
      summary:
        "The difference between inspiration and imitation, with three iteration strategies: keep topic and change format, keep format and change angle, or keep both and rewrite only the hook.",
      moduleSlug: "finding-what-works-in-your-niche",
      order: 2,
      resourceSlugs: [],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M3 lesson 2`,
    },
    {
      slug: "thumbnails-and-titles",
      title: "Thumbnails and Titles on Long-Form Platforms",
      summary:
        "How YouTube thumbnails and titles function as a unit, five elements of a high-performing thumbnail, curiosity without misleading, and common click-through mistakes.",
      moduleSlug: "packaging-your-content",
      order: 1,
      resourceSlugs: ["packaging-checklist"],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M4 lesson 1`,
    },
    {
      slug: "captions-and-on-screen-text",
      title: "Captions and On-Screen Text for Short-Form Platforms",
      summary:
        "How Instagram, TikTok, and LinkedIn captions differ, the caption first line as a secondary hook, and how on-screen text retains viewers watching without sound.",
      moduleSlug: "packaging-your-content",
      order: 2,
      resourceSlugs: ["packaging-checklist"],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M4 lesson 2`,
    },
    {
      slug: "three-metrics-for-a-beginner",
      title: "The Three Metrics That Matter for a Beginner",
      summary:
        "Platform-tailored metrics: average view duration, click-through rate, and impressions for YouTube; non-follower reach, saves, and profile visits for Instagram; watch time, shares, and profile visits for TikTok; and external impressions, comments, and followers gained for LinkedIn.",
      moduleSlug: "reading-your-numbers-without-panicking",
      order: 1,
      resourceSlugs: [],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M5 lesson 1`,
    },
    {
      slug: "spotting-what-is-working",
      title: "Spotting What Is Working Across Your Posts",
      summary:
        "How to compare multiple posts against the same metric set to identify patterns, distinguish signal from noise in a small data set, and identify a content type, topic, or hook style performing above average.",
      moduleSlug: "reading-your-numbers-without-panicking",
      order: 2,
      resourceSlugs: [],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M5 lesson 2`,
    },
    {
      slug: "designing-your-weekly-workflow",
      title: "Designing Your Weekly Content Workflow",
      summary:
        "The four components: research day, planning and scripting session, batch filming session, and publishing and analytics check day. Assign each to a specific day based on real beginner-level time.",
      moduleSlug: "building-your-content-system",
      order: 1,
      resourceSlugs: ["weekly-content-schedule"],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M6 lesson 1`,
    },
    {
      slug: "scheduling-and-spacing-content",
      title: "Scheduling and Spacing Your Content for Consistency",
      summary:
        "How to create a publishing schedule that maintains consistent output, use a content bank, and choose between evergreen and timely content.",
      moduleSlug: "building-your-content-system",
      order: 2,
      resourceSlugs: ["weekly-content-schedule", "30-day-forward-plan-template"],
      sourceReference: `${SOURCE_WORKBOOK}, Studio Modules M6 lesson 2`,
    },
  ],
  resources: [
    {
      slug: "script-skeleton-template",
      title: "Script Skeleton Template",
      description: "Four-element structure: opening hook, setup, main point, close. Half-page script template.",
      referencedDays: [5, 10, 17],
      lessonSlug: "four-hook-formulas",
      sourceReference: `${SOURCE_WORKBOOK}, Templates Required row 1`,
    },
    {
      slug: "hook-formula-cheatsheet",
      title: "Hook Formula Cheatsheet",
      description: "Four hook formulas: bold claim, tension question, unexpected statement, and story open.",
      referencedDays: [4],
      lessonSlug: "what-a-hook-is",
      sourceReference: `${SOURCE_WORKBOOK}, Templates Required row 2`,
    },
    {
      slug: "four-point-self-review-framework",
      title: "Four-Point Self-Review Framework",
      description: "Scoring grid for Hook, Clarity, Energy, and Finish.",
      referencedDays: [4, 7],
      lessonSlug: "storytelling-structure",
      sourceReference: `${SOURCE_WORKBOOK}, Templates Required row 3`,
    },
    {
      slug: "niche-research-list-template",
      title: "Niche Research List Template",
      description: "Table with Creator, Post Topic, Hook Opening, and What Made It Work columns.",
      referencedDays: [9],
      lessonSlug: "find-viral-outlier-content",
      sourceReference: `${SOURCE_WORKBOOK}, Templates Required row 4`,
    },
    {
      slug: "packaging-checklist",
      title: "Packaging Checklist",
      description: "Three sections covering title or caption, thumbnail, and on-screen text.",
      referencedDays: [13],
      lessonSlug: "thumbnails-and-titles",
      sourceReference: `${SOURCE_WORKBOOK}, Templates Required row 5`,
    },
    {
      slug: "weekly-content-schedule",
      title: "Weekly Content Schedule",
      description: "Four sections: Research Day, Planning Session, Filming Session, and Publishing Schedule.",
      referencedDays: [19],
      lessonSlug: "designing-your-weekly-workflow",
      sourceReference: `${SOURCE_WORKBOOK}, Templates Required row 6`,
    },
    {
      slug: "30-day-forward-plan-template",
      title: "30-Day Forward Plan Template",
      description: "Six sections: compass, pillars, weekly rhythm, next batch date, one metric, and one creative goal by Day 52.",
      referencedDays: [21],
      lessonSlug: "scheduling-and-spacing-content",
      sourceReference: `${SOURCE_WORKBOOK}, Templates Required row 7`,
    },
  ],
  milestones: [
    {
      name: "You Know What You Stand For",
      triggerDay: 3,
      copy: "Compass and pillars saved. Filter for every future decision.",
      sourceReference: `${SOURCE_WORKBOOK}, Overview milestone M1`,
    },
    {
      name: "Your First Take Exists",
      triggerDay: 6,
      copy: "Batch One filmed. Four camera reps before first publish.",
      sourceReference: `${SOURCE_WORKBOOK}, Overview milestone M2`,
    },
    {
      name: "Your First Take is Ready to Publish",
      triggerDay: 7,
      copy: "Self-review complete. Best piece identified and edited.",
      sourceReference: `${SOURCE_WORKBOOK}, Overview milestone M3`,
    },
    {
      name: "You Are a Creator Now",
      triggerDay: 7,
      copy: "First live publish. Identity shift happens here.",
      sourceReference: `${SOURCE_WORKBOOK}, Overview milestone M4`,
    },
    {
      name: "You Have a Research and Production Workflow",
      triggerDay: 12,
      copy: "Four posts live. Batch Two filmed. Research habit established.",
      sourceReference: `${SOURCE_WORKBOOK}, Overview milestone M5`,
    },
    {
      name: "You Have Published Five Times",
      triggerDay: 13,
      copy: "Five live posts. Packaging skill applied.",
      sourceReference: `${SOURCE_WORKBOOK}, Overview milestone M6`,
    },
    {
      name: "You Can Read Your Own Data",
      triggerDay: 16,
      copy: "First full content audit complete.",
      sourceReference: `${SOURCE_WORKBOOK}, Overview milestone M7`,
    },
    {
      name: "Your Biggest Batch is Done",
      triggerDay: 18,
      copy: "Seven pieces filmed in Batch Three.",
      sourceReference: `${SOURCE_WORKBOOK}, Overview milestone M8`,
    },
    {
      name: "You Have a System That Outlasts This Programme",
      triggerDay: 21,
      copy: "Ten posts live. Forward plan written. Programme ends. Habit does not.",
      sourceReference: `${SOURCE_WORKBOOK}, Overview milestone M9`,
    },
  ],
  insightMoments: [
    {
      triggerType: "task_completed",
      triggerCondition: "Fires on Day 3 completion when user saves their Pillars Board",
      sourceTrigger: "Day 3 completion",
      copy: "You have a content compass and three pillars. Most creators spend years posting without either. You built yours in three days. Every piece of content you make from here has a filter. Every idea you have from now on either fits your pillars or it does not. That is not nothing. That is the thing most creators are missing.",
      sourceReference: `${SOURCE_WORKBOOK}, Insight Moments row 1`,
    },
    {
      triggerType: "day",
      triggerCondition: "Fires within 48 hours of Live Post 1 (Day 7) if view count is below platform average for new accounts",
      sourceTrigger: "Low views on Post 1",
      copy: "Your first post is live. If the views are low right now that is completely normal. The platform does not know who you are yet. Every account starts with zero reach. The algorithm needs to see several posts before it understands who to show your content to. One creator posted for three months to almost nobody before one video hit a million views and never looked back. Those early low-view posts were not wasted. They were the platform learning. Keep going.",
      sourceReference: `${SOURCE_WORKBOOK}, Insight Moments row 2`,
    },
    {
      triggerType: "three_consecutive_skipped_days",
      triggerCondition: "Fires after three consecutive days with no task completion at any point in the programme",
      sourceTrigger: "Three consecutive skipped days",
      copy: "You missed a few days. That is okay. The streak matters less than the return. Every creator you follow has gaps in their content history. The ones who built something are not the ones who never missed a day. They are the ones who came back when they did. Your programme is still here. Your scripts are still saved. Pick up where you left off.",
      sourceReference: `${SOURCE_WORKBOOK}, Insight Moments row 3`,
    },
    {
      triggerType: "task_completed",
      triggerCondition: "Fires on Day 21 completion when user saves their 30-day forward plan",
      sourceTrigger: "Day 21 completion",
      copy: "You started this programme having never posted with intention. You finish it with ten posts live and a plan you wrote yourself. Most people who said they were going to start this year still have not. You have ten posts, a batch workflow, and a content system that is yours. That is the hardest part done. Everything from here is iteration.",
      sourceReference: `${SOURCE_WORKBOOK}, Insight Moments row 4`,
    },
  ],
  tasks: [...scheduleTasks, ...day21Tasks],
};

export interface FirstTakeSeedOptions {
  /**
   * Existing Payload Media ids keyed by the seven approved resource slugs.
   * The workbook contains the resource specifications but no binary assets,
   * so this is intentionally optional and never invents attachments.
   */
  resourceMediaIds?: Record<string, number | string>;
}

export interface FirstTakeSeedResult {
  created: Record<string, number>;
  updated: Record<string, number>;
  resourcesRequired: number;
  resourcesAttached: number;
  warnings: string[];
}

type SeedDocument = Record<string, unknown> & { id?: string | number };

type PayloadSeedClient = Pick<Payload, "find" | "create" | "update">;

function idOf(document: SeedDocument): string | number {
  if (document.id === undefined || document.id === null) {
    throw new Error("Payload seed document did not return an id");
  }

  return document.id;
}

async function findBySlug(
  payload: PayloadSeedClient,
  collection: string,
  slug: string,
): Promise<SeedDocument | undefined> {
  const result = await payload.find({
    collection: collection as never,
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { slug: { equals: slug } },
  });

  return (result.docs?.[0] as SeedDocument | undefined) ?? undefined;
}

async function upsert(
  payload: PayloadSeedClient,
  collection: string,
  slug: string,
  data: Record<string, unknown>,
  result: FirstTakeSeedResult,
): Promise<SeedDocument> {
  const existing = await findBySlug(payload, collection, slug);
  const publishedData = {
    ...data,
    _status: "published" as const,
  };

  if (existing) {
    const updated = (await payload.update({
      collection: collection as never,
      id: idOf(existing),
      data: publishedData as never,
      draft: false,
      overrideAccess: true,
    })) as unknown as SeedDocument;
    result.updated[collection] = (result.updated[collection] ?? 0) + 1;
    return updated;
  }

  const created = (await payload.create({
    collection: collection as never,
    data: publishedData as never,
    draft: false,
    overrideAccess: true,
  })) as unknown as SeedDocument;
  result.created[collection] = (result.created[collection] ?? 0) + 1;
  return created;
}

function relationIds(documents: SeedDocument[]): Array<string | number> {
  return documents.map(idOf);
}

function taskInstructions(task: FirstTakeTaskSpec): RichText {
  return richText(
    task.openingLine,
    `Objective: ${task.objective}`,
    task.instruction,
    `Why it matters: ${task.whyItMatters}`,
  );
}

function resourceAttachments(
  lesson: FirstTakeLessonSpec,
  resourceMediaIds: Record<string, number | string>,
): Array<number | string> {
  return lesson.resourceSlugs
    .map((slug) => resourceMediaIds[slug])
    .filter((id): id is number | string => id !== undefined);
}

/**
 * Upserts the approved v1.1 programme in dependency order. Payload remains
 * the source of truth; publishing each document queues the normal mirror job.
 * Run the content mirror backfill after this command when a synchronous
 * disposable-environment verification is required.
 */
export async function seedFirstTake(
  payload: PayloadSeedClient,
  options: FirstTakeSeedOptions = {},
): Promise<FirstTakeSeedResult> {
  const result: FirstTakeSeedResult = {
    created: {},
    updated: {},
    resourcesRequired: firstTakeV11Manifest.resources.length,
    resourcesAttached: 0,
    warnings: [],
  };
  const resourceMediaIds = options.resourceMediaIds ?? {};

  const programme = await upsert(
    payload,
    "programmes",
    firstTakeV11Manifest.programme.slug,
    {
      title: firstTakeV11Manifest.programme.title,
      key: firstTakeV11Manifest.programme.slug,
      lifecycleStatus: "live",
      slug: firstTakeV11Manifest.programme.slug,
      description: firstTakeV11Manifest.programme.description,
      durationDays: firstTakeV11Manifest.programme.durationDays,
      experienceLevel: firstTakeV11Manifest.programme.experienceLevel,
      difficulty: firstTakeV11Manifest.programme.difficulty,
      track: firstTakeV11Manifest.programme.track,
      expectations: richText(firstTakeV11Manifest.programme.expectations),
      ctaText: firstTakeV11Manifest.programme.ctaText,
      milestones: firstTakeV11Manifest.milestones.map((milestone) => ({
        name: milestone.name,
        triggerDay: milestone.triggerDay,
        copy: richText(milestone.copy),
      })),
      insightMoments: firstTakeV11Manifest.insightMoments.map((moment) => ({
        triggerType: moment.triggerType,
        triggerCondition: moment.triggerCondition,
        copy: richText(moment.copy),
      })),
    },
    result,
  );

  const lessonsBySlug = new Map<string, SeedDocument>();
  for (const lesson of firstTakeV11Manifest.lessons) {
    const attachments = resourceAttachments(lesson, resourceMediaIds);
    // Publishing a lesson requires its tagging vocabulary. The workbook does
    // not tag lessons, so the day comes from the lesson's module, the content
    // type from that module's tasks, and lessonType is a placeholder: every
    // seeded lesson is an article, which is the type that carries `body`.
    const lessonModule = firstTakeV11Manifest.modules.find(
      (moduleSpec) => moduleSpec.slug === lesson.moduleSlug,
    );
    if (!lessonModule) {
      throw new Error(`Missing module ${lesson.moduleSlug} for ${lesson.slug}`);
    }
    const lessonTask = firstTakeV11Manifest.tasks.find(
      (task) => task.moduleSlug === lesson.moduleSlug,
    );
    const saved = await upsert(
      payload,
      "lessons",
      lesson.slug,
      {
        title: lesson.title,
        slug: lesson.slug,
        summary: lesson.summary,
        body: richText(lesson.summary),
        lessonType: "article",
        skillLevel: firstTakeV11Manifest.programme.experienceLevel,
        contentType: lessonTask?.contentType ?? "video",
        platforms: ["instagram"],
        programmeRelevance: [idOf(programme)],
        programmeDayStart: lessonModule.dayNumber,
        programmeDayEnd: lessonModule.dayNumber,
        ...(attachments.length > 0 ? { attachments } : {}),
      },
      result,
    );
    lessonsBySlug.set(lesson.slug, saved);
    result.resourcesAttached += attachments.length;
  }

  const modulesBySlug = new Map<string, SeedDocument>();
  for (const moduleSpec of firstTakeV11Manifest.modules) {
    const saved = await upsert(
      payload,
      "modules",
      moduleSpec.slug,
      {
        title: moduleSpec.title,
        slug: moduleSpec.slug,
        order: moduleSpec.order,
        programme: idOf(programme),
        lessons: relationIds(
          moduleSpec.lessons.map((lesson) => {
            const savedLesson = lessonsBySlug.get(lesson.slug);
            if (!savedLesson) {
              throw new Error(
                `Missing lesson ${lesson.slug} for ${moduleSpec.slug}`,
              );
            }
            return savedLesson;
          }),
        ),
      },
      result,
    );
    modulesBySlug.set(moduleSpec.slug, saved);
  }

  for (const task of firstTakeV11Manifest.tasks) {
    const taskModule = modulesBySlug.get(task.moduleSlug);
    if (!taskModule) {
      throw new Error(`Missing module ${task.moduleSlug} for ${task.slug}`);
    }

    await upsert(
      payload,
      "tasks",
      task.slug,
      {
        title: task.title,
        slug: task.slug,
        instructions: taskInstructions(task),
        contentType: task.contentType,
        programme: idOf(programme),
        module: idOf(taskModule),
        dayNumber: task.dayNumber,
        orderWithinDay: task.orderWithinDay,
        dayType: task.dayType,
        timeEstimateMinutes: task.timeEstimateMinutes,
        publishSlot: task.publishSlot,
        postNumber: task.postNumber,
        pausePrompt: richText(task.pausePrompt),
        outputDescription: richText(task.output),
      },
      result,
    );
  }

  const missingResources = firstTakeV11Manifest.resources.filter(
    (resource) => resourceMediaIds[resource.slug] === undefined,
  );
  if (missingResources.length > 0) {
    result.warnings.push(
      `${missingResources.length} approved First Take resources have no Payload Media id; provide resourceMediaIds before content sign-off: ${missingResources.map((resource) => resource.slug).join(", ")}`,
    );
  }

  return result;
}

export { richText };
