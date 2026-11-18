import * as React from "react";
import { z } from "zod";
import { safeContentUrl } from "../../lib/studio-lesson";

const documentSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  url: z.string().optional(),
  alt: z.string().nullable().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  title: z.string().optional(),
  slug: z.string().optional(),
});
type Document = z.infer<typeof documentSchema>;
type ArticleNode = {
  type: string;
  children?: ArticleNode[];
  text?: string;
  format?: number | string;
  tag?: string;
  listType?: string;
  start?: number;
  checked?: boolean;
  indent?: number;
  relationTo?: string;
  value?: Document;
  fields?: {
    url?: string | null;
    newTab?: boolean;
    doc?: { relationTo: string; value: Document } | null;
  };
};
const nodeSchema: z.ZodType<ArticleNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "root",
        "paragraph",
        "heading",
        "text",
        "tab",
        "list",
        "listitem",
        "quote",
        "linebreak",
        "link",
        "autolink",
        "upload",
        "relationship",
        "horizontalrule",
      ]),
      children: z.array(nodeSchema).optional(),
      text: z.string().optional(),
      format: z.union([z.number().int(), z.string()]).optional(),
      tag: z.enum(["h1", "h2", "h3", "h4", "h5", "h6"]).optional(),
      listType: z.enum(["number", "bullet", "check"]).optional(),
      start: z.number().int().positive().optional(),
      checked: z.boolean().optional(),
      indent: z.number().int().min(0).max(20).optional(),
      relationTo: z.string().optional(),
      value: documentSchema.optional(),
      fields: z
        .object({
          url: z.string().nullish(),
          newTab: z.boolean().optional(),
          doc: z
            .object({ relationTo: z.string(), value: documentSchema })
            .nullish(),
        })
        .optional(),
    })
    .superRefine((node, context) => {
      const containers = [
        "root",
        "paragraph",
        "heading",
        "list",
        "listitem",
        "quote",
        "link",
        "autolink",
      ];
      if (containers.includes(node.type) && !node.children)
        context.addIssue({ code: "custom", message: "Missing children" });
      if (node.type === "text" && node.text === undefined)
        context.addIssue({ code: "custom", message: "Missing text" });
      if (node.type === "upload" && !articleUrl(node.value?.url))
        context.addIssue({ code: "custom", message: "Unresolved upload" });
      if (
        node.type === "relationship" &&
        !node.value?.title &&
        !node.value?.filename
      )
        context.addIssue({
          code: "custom",
          message: "Unresolved relationship",
        });
    }),
);

function articleUrl(value: unknown): string | null {
  // Relative app/CMS links are safe; protocol-relative URLs and backslashes are not.
  if (
    typeof value === "string" &&
    /^\/(?!\/)/.test(value) &&
    !value.includes("\\") &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    return value;
  return safeContentUrl(value);
}
function linkUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.includes("\\") ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    return null;
  if (value.startsWith("#") || /^\.{1,2}\//.test(value)) return value;
  try {
    const url = new URL(value);
    if (["mailto:", "tel:"].includes(url.protocol)) return url.href;
  } catch {
    /* Relative app URLs are handled below. */
  }
  return articleUrl(value);
}
function documentUrl(
  collection: string | undefined,
  value: Document | undefined,
) {
  if (collection === "lessons" && (value?.slug || value?.id))
    return `/studio?lesson=${encodeURIComponent(value.slug || String(value.id))}`;
  return articleUrl(value?.url);
}
function renderNode(node: ArticleNode, index: number): React.ReactNode {
  const children = node.children?.map(renderNode);
  const format = typeof node.format === "number" ? node.format : 0;
  const alignment =
    typeof node.format === "string" &&
    ["left", "center", "right", "justify", "start", "end"].includes(node.format)
      ? (node.format as React.CSSProperties["textAlign"])
      : undefined;
  const style: React.CSSProperties = {
    textAlign: alignment,
    paddingInlineStart: node.indent ? `${node.indent * 2}em` : undefined,
  };
  switch (node.type) {
    case "text": {
      let text: React.ReactNode = node.text;
      if (format & 1) text = <strong>{text}</strong>;
      if (format & 2) text = <em>{text}</em>;
      if (format & 4) text = <s>{text}</s>;
      if (format & 8) text = <u>{text}</u>;
      if (format & 16) text = <code>{text}</code>;
      if (format & 32) text = <sub>{text}</sub>;
      if (format & 64) text = <sup>{text}</sup>;
      return <React.Fragment key={index}>{text}</React.Fragment>;
    }
    case "tab":
      return (
        <span key={index} className="whitespace-pre">
          {"\t"}
        </span>
      );
    case "heading":
      return React.createElement(
        node.tag ?? "h2",
        { key: index, style },
        children,
      );
    case "paragraph":
      return (
        <p key={index} style={style}>
          {children}
        </p>
      );
    case "list":
      return node.listType === "number" ? (
        <ol key={index} start={node.start} style={style}>
          {children}
        </ol>
      ) : (
        <ul
          key={index}
          className={node.listType === "check" ? "list-none" : undefined}
          style={style}
        >
          {children}
        </ul>
      );
    case "listitem":
      return (
        <li key={index} style={style}>
          {typeof node.checked === "boolean" ? (
            <input
              aria-label={node.checked ? "Completed item" : "Incomplete item"}
              type="checkbox"
              checked={node.checked}
              disabled
              className="mr-2"
            />
          ) : null}
          {children}
        </li>
      );
    case "quote":
      return (
        <blockquote key={index} style={style}>
          {children}
        </blockquote>
      );
    case "linebreak":
      return <br key={index} />;
    case "horizontalrule":
      return <hr key={index} className="my-6 border-border" />;
    case "link":
    case "autolink": {
      const url = node.fields?.doc
        ? documentUrl(node.fields.doc.relationTo, node.fields.doc.value)
        : linkUrl(node.fields?.url);
      return url ? (
        <a
          key={index}
          href={url}
          target={node.fields?.newTab ? "_blank" : undefined}
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ) : (
        <React.Fragment key={index}>{children}</React.Fragment>
      );
    }
    case "upload": {
      const media = node.value!;
      const url = articleUrl(media.url)!;
      if (media.mimeType && !media.mimeType.startsWith("image/"))
        return (
          <a key={index} href={url} target="_blank" rel="noopener noreferrer">
            {media.filename || media.alt || "Open attachment"}
          </a>
        );
      // CMS media may use any configured CDN; native images preserve these authored URLs.
      return (
        // oxlint-disable-next-line next/no-img-element -- Preserve authored media URLs from arbitrary configured CMS CDNs.
        <img
          key={index}
          src={url}
          alt={media.alt ?? ""}
          loading="lazy"
          className="my-4 h-auto max-w-full rounded-lg"
        />
      );
    }
    case "relationship": {
      const url = documentUrl(node.relationTo, node.value);
      const label = node.value?.title || node.value?.filename;
      return url ? (
        <a key={index} href={url}>
          {label}
        </a>
      ) : (
        <span key={index}>{label}</span>
      );
    }
    default:
      return <React.Fragment key={index}>{children}</React.Fragment>;
  }
}

export function renderArticleBody(body: unknown): React.ReactNode | null {
  // Bound recursive input before schema parsing, so corrupt mirrors cannot exhaust the stack.
  let count = 0;
  function bounded(value: unknown, depth = 0): boolean {
    if (++count > 10000 || depth > 64 || !value || typeof value !== "object")
      return false;
    const children = (value as { children?: unknown }).children;
    return (
      children === undefined ||
      (Array.isArray(children) &&
        children.every((child) => bounded(child, depth + 1)))
    );
  }
  const root =
    body && typeof body === "object" && "root" in body ? body.root : null;
  if (!bounded(root)) return null;
  const parsed = nodeSchema.safeParse(root);
  if (
    !parsed.success ||
    parsed.data.type !== "root" ||
    !parsed.data.children?.length
  )
    return null;
  return (
    <article className="mx-auto max-w-2xl text-base leading-loose text-foreground [&_p]:my-4 [&_h1]:text-3xl [&_h2]:mb-2 [&_h2]:mt-7 [&_h2]:text-2xl [&_h3]:mb-2 [&_h3]:mt-7 [&_h3]:text-xl [&_h4]:text-lg [&_h5]:font-bold [&_h6]:font-bold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:pl-6 [&_ul:not(.list-none)]:list-disc [&_li]:my-2 [&_a]:text-accent [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4">
      {parsed.data.children.map(renderNode)}
    </article>
  );
}
