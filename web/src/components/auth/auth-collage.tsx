"use client";

import * as React from "react";
import {
  inspirationQuotes,
  type InspirationQuote,
} from "@/lib/inspiration-quotes";
import { cn } from "@/lib/utils";

const GAP = 14;
const FLIP_DURATION = 1_100;
const WAVE_SPAN = 1_500;
const JITTER = 900;

const frames = [
  { src: "/brand/auth/creator-skate.jpg", tone: "light" },
  { src: "/brand/auth/creator-phone.jpg", tone: "dark" },
  { src: "/brand/auth/creator-camera.jpg", tone: "dark" },
] as const;

interface Geometry {
  cols: number;
  gridHeight: number;
  gridWidth: number;
  height: number;
  left: number;
  rows: number;
  tileSize: number;
  top: number;
  width: number;
}

interface Tile {
  col: number;
  delay: number;
  index: number;
  row: number;
}

export function AuthCollage() {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = React.useState<Geometry | null>(null);
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [quoteIndex, setQuoteIndex] = React.useState(0);
  const [flipping, setFlipping] = React.useState(false);
  const nextFrameIndex = (frameIndex + 1) % frames.length;
  const currentFrame = frames[frameIndex];

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    function measure() {
      if (!root) {
        return;
      }
      const width = root.clientWidth;
      const height = root.clientHeight;
      if (width < 50 || height < 50) {
        return;
      }
      const tileSize = Math.max(170, Math.min(320, height / 3.4));
      const cols = Math.ceil(width / (tileSize + GAP)) + 1;
      const rows = Math.ceil(height / (tileSize + GAP)) + 1;
      const gridWidth = cols * tileSize + (cols - 1) * GAP;
      const gridHeight = rows * tileSize + (rows - 1) * GAP;
      setGeometry({
        cols,
        gridHeight,
        gridWidth,
        height,
        left: (width - gridWidth) / 2,
        rows,
        tileSize,
        top: (height - gridHeight) / 2,
        width,
      });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!geometry || flipping) {
      return;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const interval = window.setTimeout(() => {
      if (reducedMotion) {
        setFrameIndex(nextFrameIndex);
        setQuoteIndex((index) => (index + 1) % inspirationQuotes.length);
        return;
      }

      setFlipping(true);
      window.setTimeout(() => {
        setFrameIndex(nextFrameIndex);
        setQuoteIndex((index) => (index + 1) % inspirationQuotes.length);
        setFlipping(false);
      }, FLIP_DURATION + WAVE_SPAN + JITTER + 80);
    }, 6_000);

    return () => window.clearTimeout(interval);
  }, [flipping, geometry, nextFrameIndex]);

  const tiles = geometry ? buildTiles(geometry) : [];
  const currentQuoteCell = geometry
    ? pickQuoteCell(geometry, quoteIndex)
    : -1;
  const nextQuoteCell = geometry
    ? pickQuoteCell(geometry, quoteIndex + 1)
    : -1;

  return (
    <div
      aria-hidden="true"
      // The gaps between tiles follow the theme, not the photo: white for the
      // whole cycle in light mode, black only in dark mode.
      className="absolute inset-0 overflow-hidden bg-white dark:bg-black"
      ref={rootRef}
    >
      {!geometry ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${currentFrame.src})` }}
        />
      ) : (
        <div
          className="absolute grid"
          style={{
            gap: GAP,
            gridTemplateColumns: `repeat(${geometry.cols}, ${geometry.tileSize}px)`,
            gridTemplateRows: `repeat(${geometry.rows}, ${geometry.tileSize}px)`,
            height: geometry.gridHeight,
            left: geometry.left,
            top: geometry.top,
            width: geometry.gridWidth,
          }}
        >
          {tiles.map((tile) => (
            <div className="[perspective:1200px]" key={tile.index}>
              <div
                className="relative size-full [transform-style:preserve-3d]"
                style={{
                  transform: flipping ? "rotateY(180deg)" : "rotateY(0deg)",
                  transitionDelay: flipping ? `${tile.delay}ms` : "0ms",
                  transitionDuration: flipping ? `${FLIP_DURATION}ms` : "0ms",
                  transitionProperty: "transform",
                  transitionTimingFunction: "cubic-bezier(.7,0,.3,1)",
                }}
              >
                <CollageFace
                  frameIndex={frameIndex}
                  geometry={geometry}
                  quote={
                    tile.index === currentQuoteCell
                      ? inspirationQuotes[quoteIndex % inspirationQuotes.length]
                      : undefined
                  }
                  tile={tile}
                />
                <CollageFace
                  back
                  frameIndex={nextFrameIndex}
                  geometry={geometry}
                  quote={
                    tile.index === nextQuoteCell
                      ? inspirationQuotes[
                          (quoteIndex + 1) % inspirationQuotes.length
                        ]
                      : undefined
                  }
                  tile={tile}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CollageFace({
  back = false,
  frameIndex,
  geometry,
  quote,
  tile,
}: {
  back?: boolean;
  frameIndex: number;
  geometry: Geometry;
  quote?: InspirationQuote;
  tile: Tile;
}) {
  const frame = frames[frameIndex];

  if (quote) {
    const [lead, rest] = splitQuote(quote.text);
    return (
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-center rounded-[14%] p-[10%] text-white [backface-visibility:hidden]",
          back && "[transform:rotateY(180deg)]",
          frame.tone === "light" ? "bg-black" : "bg-accent",
        )}
      >
        <p className="text-[clamp(15px,1.22vw,19px)] leading-[1.38]">
          <strong className="font-extrabold">{lead}</strong>
          {rest}
        </p>
        {quote.source ? (
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/65">
            {quote.source}
          </p>
        ) : null}
      </div>
    );
  }

  const imageStyle = getImageStyle(geometry, tile, frame.src);
  return (
    <div
      className={cn(
        "absolute inset-0 rounded-[14%] bg-no-repeat [backface-visibility:hidden]",
        back && "[transform:rotateY(180deg)]",
      )}
      style={imageStyle}
    />
  );
}

function buildTiles(geometry: Geometry): Tile[] {
  const maxDiagonal = Math.max(1, geometry.cols - 1 + geometry.rows - 1);
  return Array.from({ length: geometry.cols * geometry.rows }, (_, index) => {
    const col = index % geometry.cols;
    const row = Math.floor(index / geometry.cols);
    return {
      col,
      delay: Math.round(
        ((col + row) / maxDiagonal) * WAVE_SPAN + ((index * 137) % JITTER),
      ),
      index,
      row,
    };
  });
}

function pickQuoteCell(geometry: Geometry, seed: number): number {
  const visible: number[] = [];
  for (let row = 0; row < geometry.rows; row += 1) {
    for (let col = 0; col < geometry.cols; col += 1) {
      const x = geometry.left + col * (geometry.tileSize + GAP);
      const y = geometry.top + row * (geometry.tileSize + GAP);
      if (
        x >= 0 &&
        y >= 0 &&
        x + geometry.tileSize <= geometry.width &&
        y + geometry.tileSize <= geometry.height
      ) {
        visible.push(row * geometry.cols + col);
      }
    }
  }
  return visible.length > 0 ? visible[seed % visible.length] : 0;
}

function getImageStyle(
  geometry: Geometry,
  tile: Tile,
  src: string,
): React.CSSProperties {
  const sourceWidth = 1_600;
  const sourceHeight = 893;
  const scale = Math.max(
    geometry.width / sourceWidth,
    geometry.height / sourceHeight,
  );
  const imageWidth = sourceWidth * scale;
  const imageHeight = sourceHeight * scale;
  const imageLeft = (geometry.width - imageWidth) / 2;
  const imageTop = (geometry.height - imageHeight) / 2;
  const tileLeft = geometry.left + tile.col * (geometry.tileSize + GAP);
  const tileTop = geometry.top + tile.row * (geometry.tileSize + GAP);

  return {
    backgroundImage: `url(${src})`,
    backgroundPosition: `${imageLeft - tileLeft}px ${imageTop - tileTop}px`,
    backgroundSize: `${imageWidth}px ${imageHeight}px`,
  };
}

function splitQuote(text: string): [string, string] {
  const sentenceEnd = text.indexOf(". ");
  if (sentenceEnd === -1) {
    return [text, ""];
  }
  return [text.slice(0, sentenceEnd + 1), text.slice(sentenceEnd + 1)];
}
