import { type ClipIndex, STILL_SIZE, TALL_QUERY, posterSrc } from "@/flight/film";

interface FilmStillProps {
  /** The clip whose first frame to show. */
  clip: ClipIndex;
  className?: string;
  /** Load at once with high priority (the opening frame); otherwise lazily. */
  priority?: boolean;
}

/**
 * A still from the filmed flight, in the framing that suits the screen.
 * Decorative: the chapter text beside it carries the meaning.
 *
 * Each clip's first frame is a keyframe of the journey (runway, coast,
 * valley, industry, terrain, city, clouds), so the stills double as the
 * backdrops of the static experience.
 */
export function FilmStill({ clip, className, priority = false }: FilmStillProps) {
  return (
    <picture className={className}>
      <source media={TALL_QUERY} srcSet={posterSrc(clip, "tall")} {...STILL_SIZE.tall} />
      {/* Sized and compressed at build time; <picture> art-directs two crops. */}
      <img
        src={posterSrc(clip, "wide")}
        alt=""
        {...STILL_SIZE.wide}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </picture>
  );
}
