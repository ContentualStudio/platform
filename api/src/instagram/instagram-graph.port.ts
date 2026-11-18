// The seam between the Instagram integration's write paths and the actual
// Meta Graph API, which nothing in this repo talks to yet. Bound by symbol —
// same reasoning as CONTENT_EVENT_EVALUATOR — so Nest can inject the
// interface.
export interface InstagramGraphAccount {
  readonly externalAccountId: string;
  readonly username: string;
  readonly followerCount: number;
}

export interface FetchInstagramAccountInput {
  readonly userId: string;
  readonly credential: string;
}

export interface InstagramGraphPort {
  fetchAccount(input: FetchInstagramAccountInput): Promise<InstagramGraphAccount>;
}

export const INSTAGRAM_GRAPH = Symbol("INSTAGRAM_GRAPH");
