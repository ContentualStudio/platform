import configPromise from "@payload-config";
import { RootPage, generatePageMetadata } from "@payloadcms/next/views";
import type { Metadata } from "next";

import { importMap } from "../importMap";

// `params` must be passed through untouched. For /admin, Next resolves
// `segments` to undefined, and Payload relies on that to build the route as
// `/admin`. Defaulting it to [] makes Payload build `/admin/` instead, which
// matches no view and renders a 404 once a user exists.
type PageArgs = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
};

export const generateMetadata = ({
  params,
  searchParams,
}: PageArgs): Promise<Metadata> =>
  generatePageMetadata({
    config: configPromise,
    params,
    searchParams,
  });

const Page = ({ params, searchParams }: PageArgs) =>
  RootPage({
    config: configPromise,
    importMap,
    params,
    searchParams,
  });

export default Page;
