import React, { useState, useMemo } from 'react';
import { optimizeCloudinaryUrl } from '../utils/cloudinaryUtils';
import { getImageUrl, handleImageError } from '../utils/imageHelper';

const LazyImage = ({ src, alt = '', className = '', onError, ...rest }) => {
  const [loaded, setLoaded] = useState(false);

  const supportsOptimization = (imageSrc) => {
    if (!imageSrc || typeof imageSrc !== 'string' || imageSrc === '') return false;
    if (imageSrc.startsWith('data:') || imageSrc.startsWith('/')) return false;
    return /^https?:\/\//.test(imageSrc);
  };

  const finalSrc = useMemo(() => {
    if (!src) return getImageUrl('');
    if (supportsOptimization(src)) {
      if (/res\.cloudinary\.com/i.test(src)) {
        return optimizeCloudinaryUrl(src, { format: 'auto', quality: 'auto:good' });
      }
      try {
        const url = new URL(src);
        if (url.hostname.includes('unsplash.com')) {
          url.searchParams.set('fm', 'webp');
          url.searchParams.set('q', '80');
          return url.toString();
        }
      } catch {}
    }
    return getImageUrl(src);
  }, [src]);

  return (
    <img
      src={finalSrc}
      alt={alt}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      onError={(e) => {
        handleImageError(e);
        if (onError) onError(e);
      }}
      className={`${className} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      {...rest}
    />
  );
};

export default LazyImage;
