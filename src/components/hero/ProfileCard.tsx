import { useState } from 'react';
import type { Profile } from '../../../scripts/content/schema';

export function ProfileCard({ profile }: { profile: Profile }) {
  const [failed, setFailed] = useState(false);
  const image = profile.image;

  return (
    <div className="profile-card-shell">
      <div className="profile-card-hanger" aria-hidden="true">
        <span className="profile-card-ring" />
      </div>
      <div className="profile-card">
        <div className="profile-card-photo">
          {image && !failed ? (
            <img
              src={`/media/${image.assetPath}`}
              alt={image.alt}
              width={image.width}
              height={image.height}
              ref={(element) => {
                if (element?.complete && element.naturalWidth === 0) setFailed(true);
              }}
              onError={() => setFailed(true)}
            />
          ) : (
            <p className="profile-card-fallback">Portrait unavailable</p>
          )}
        </div>
        <div className="profile-card-meta">
          <p className="profile-card-name">{profile.name}</p>
          <p className="profile-card-title">{profile.title}</p>
        </div>
      </div>
    </div>
  );
}
