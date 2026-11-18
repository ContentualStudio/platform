export interface InspirationQuote {
  source?: string;
  text: string;
}

export const inspirationQuotes: readonly InspirationQuote[] = [
  {
    text: "88% of creators experience barriers to growing their creator business. Getting stuck is normal. Staying stuck doesn’t have to be.",
    source: "CreatorIQ",
  },
  {
    text: "The creator industry is projected to reach $500 billion by 2027. There’s a lot of room on this playing field.",
    source: "Visa",
  },
  {
    text: "68% of creators already see themselves as small business owners. Maybe it’s time you did too.",
    source: "Visa",
  },
  {
    text: "Creator content can deliver more than 2× the impact of traditional branded digital content. You don’t need a big team to make a big impact.",
    source: "Kantar",
  },
  {
    text: "61% of marketers globally plan to increase their investment in creator content. Your seat at the table is getting bigger.",
    source: "Kantar",
  },
  {
    text: "Formats can be copied. Trends can be copied. Your unique point of view can’t.",
  },
  {
    text: "Getting discovered is only the beginning. Give people a reason to keep coming back.",
  },
  {
    text: "72% of creators already create content frequently on their phones. Your next great idea probably fits in your pocket.",
    source: "Adobe",
  },
  {
    text: "Only 17% of consumers check a creator’s follower count before deciding whether to engage. What you create matters more than how many followers you have.",
    source: "Sprout Social",
  },
  {
    text: "Only 12% of creators create content full-time. You don’t have to go all-in on day one to start building something real.",
    source: "Influencer",
  },
  {
    text: "62% of creators already work with some form of operational support. Even solo creators and marketers need a guide in their corner.",
    source: "CreatorIQ",
  },
  {
    text: "Creators don’t just collect followers. They build communities people choose to come back to.",
  },
  {
    text: "As content gets easier to automate, being unmistakably human becomes more valuable.",
  },
  {
    text: "Going viral gets attention. Building trust gives that attention somewhere to go.",
  },
  {
    text: "42% of businesses say digital marketing and SEO are an urgent training need. Skills can be learned. You just need somewhere to start.",
    source: "OECD",
  },
  {
    text: "44% of high-growth small businesses said improving their strategy positively influenced their growth. Good direction can make a small team play bigger.",
    source: "CPA Australia",
  },
  {
    text: "People watch more than 1 billion hours of YouTube every day. The opportunity isn’t finding an audience. It’s finding your place in it.",
    source: "YouTube",
  },
  {
    text: "73% of creators across 45 countries said they struggle with what to do next. Talent gets you started. Guidance helps you grow.",
    source: "UNESCO",
  },
  {
    text: "Business-focused creators are 2× more likely to make $10K+ per month than consumer-focused creators.",
    source: "Teachable",
  },
  {
    text: "66% of creators manage everything themselves. You don’t need a bigger team. Sometimes you just need someone in your corner.",
    source: "Kolsquare & NewtonX",
  },
] as const;
