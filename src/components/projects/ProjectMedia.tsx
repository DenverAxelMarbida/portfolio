import { useState } from 'react';
import type { PublicProject } from '../../../scripts/content/schema';

type Screenshot = PublicProject['screenshots'][number];

export function ProjectMedia({ screenshots, label }: { screenshots: Screenshot[]; label: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const [index, setIndex] = useState(0);

  const available = screenshots.filter((image) => !failed.includes(image.assetPath));
  if (available.length === 0) return <p className="project-media-empty">Screenshots pending</p>;

  const current = available[Math.min(index, available.length - 1)] as Screenshot;
  const multiple = available.length > 1;

  return (
    <div className="project-media" role="group" aria-label={label}>
      <figure className="project-media-figure">
        <img
          src={`/media/${current.assetPath}`}
          alt={current.alt}
          width={current.width}
          height={current.height}
          loading="lazy"
          decoding="async"
          ref={(element) => {
            if (element?.complete && element.naturalWidth === 0) {
              setFailed((paths) =>
                paths.includes(current.assetPath) ? paths : [...paths, current.assetPath],
              );
            }
          }}
          onError={() =>
            setFailed((paths) =>
              paths.includes(current.assetPath) ? paths : [...paths, current.assetPath],
            )
          }
        />
        {current.caption && <figcaption>{current.caption}</figcaption>}
      </figure>
      {multiple && (
        <div className="project-media-controls">
          <button
            type="button"
            onClick={() => setIndex((value) => (value - 1 + available.length) % available.length)}
          >
            Previous screenshot
          </button>
          <p>
            {index + 1} of {available.length}
          </p>
          <button type="button" onClick={() => setIndex((value) => (value + 1) % available.length)}>
            Next screenshot
          </button>
        </div>
      )}
    </div>
  );
}
