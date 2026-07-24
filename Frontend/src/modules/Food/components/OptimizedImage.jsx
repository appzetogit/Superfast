import React, { useState, useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { optimizeCloudinaryUrl } from '../../../shared/utils/cloudinaryUtils'
import { getImageUrl, getFallbackImage } from '../../../shared/utils/imageHelper'

/**
 * OptimizedImage Component
 * 
 * Features:
 * - Lazy loading with Intersection Observer
 * - Responsive srcset for different screen sizes
 * - WebP/AVIF format support with fallback
 * - Blur placeholder (LQIP) for smooth loading
 * - Preloading for critical images
 * - Proper decoding and fetchpriority
 * - Error handling with fallback
 */
const OptimizedImage = React.memo(({
  src,
  alt,
  className = '',
  priority = false, // For above-the-fold images
  sizes = '100vw',
  objectFit = 'cover',
  placeholder = 'blur',
  blurDataURL,
  onLoad,
  onError,
  backendOrigin = "",
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isInView, setIsInView] = useState(priority) // Start visible if priority
  const imgRef = useRef(null)
  const observerRef = useRef(null)

  // Check if image URL supports optimization (external URLs)
  const supportsOptimization = (imageSrc) => {
    if (!imageSrc || typeof imageSrc !== 'string' || imageSrc === '') return false
    if (imageSrc.startsWith('data:') || imageSrc.startsWith('/')) return false
    // Check if it's an external URL (http/https)
    return /^https?:\/\//.test(imageSrc)
  }

  const appendImageParams = (imageSrc, params) => {
    try {
      const url = new URL(imageSrc)
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value))
      })
      return url.toString()
    } catch {
      return imageSrc
    }
  }

  const resolveUrl = (url) => {
    return getImageUrl(url)
  }

  const resolvedSrc = useMemo(() => resolveUrl(src), [src, backendOrigin])

  // Generate responsive srcset
  const srcSet = useMemo(() => {
    if (!supportsOptimization(resolvedSrc)) return undefined
    const sizesArr = [300, 600, 900, 1200]
    
    // Check if it's Cloudinary
    if (/res\.cloudinary\.com/i.test(resolvedSrc)) {
      return sizesArr
        .map(size => `${optimizeCloudinaryUrl(resolvedSrc, { width: size, quality: 'auto:good', format: 'auto' })} ${size}w`)
        .join(', ')
    }

    return sizesArr
      .map(size => `${appendImageParams(resolvedSrc, { w: size, q: 80 })} ${size}w`)
      .join(', ')
  }, [resolvedSrc])

  // Generate WebP srcset
  const webPSrcSet = useMemo(() => {
    if (!supportsOptimization(resolvedSrc)) return undefined
    const sizesArr = [300, 600, 900, 1200]

    // Check if it's Cloudinary
    if (/res\.cloudinary\.com/i.test(resolvedSrc)) {
      return sizesArr
        .map(size => `${optimizeCloudinaryUrl(resolvedSrc, { width: size, quality: 'auto:good', format: 'webp' })} ${size}w`)
        .join(', ')
    }

    return sizesArr
      .map(size => `${appendImageParams(resolvedSrc, { w: size, q: 80, format: 'webp' })} ${size}w`)
      .join(', ')
  }, [resolvedSrc])

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority || isInView) return

    if (!imgRef.current) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true)
            if (observerRef.current && imgRef.current) {
              observerRef.current.unobserve(imgRef.current)
            }
          }
        })
      },
      {
        rootMargin: '50px', // Start loading 50px before entering viewport
        threshold: 0.01
      }
    )

    observerRef.current.observe(imgRef.current)

    return () => {
      if (observerRef.current && imgRef.current) {
        observerRef.current.unobserve(imgRef.current)
      }
    }
  }, [priority, isInView])

  const handleLoad = (e) => {
    setIsLoaded(true)
    if (onLoad) onLoad(e)
  }

  const handleError = (e) => {
    setHasError(true)
    if (onError) onError(e)
  }

  // Default blur placeholder (tiny gray square)
  const defaultBlurDataURL = blurDataURL || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2U1ZTdlYiIvPjwvc3ZnPg=='

  const fallbackSvg = getFallbackImage()

  // If src is empty, render the fallback SVG placeholder
  const finalSrc = !src || src === '' ? fallbackSvg : (hasError ? fallbackSvg : resolvedSrc)

  return (
    <div className={`relative overflow-hidden ${className}`} ref={imgRef}>
      {/* Blur Placeholder */}
      {placeholder === 'blur' && !isLoaded && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 1 }}
          animate={{ opacity: isLoaded ? 0 : 1 }}
          transition={{ duration: 0.3 }}
          style={{
            backgroundImage: `url(${defaultBlurDataURL})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
          }}
        />
      )}

      {/* Loading Skeleton */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 animate-pulse" />
      )}

      {/* Actual Image */}
      {isInView && (
        <picture className="absolute inset-0 w-full h-full">
          {/* WebP source for modern browsers */}
          {webPSrcSet && !hasError && (
            <source
              srcSet={webPSrcSet}
              sizes={sizes}
              type="image/webp"
            />
          )}

          {/* Fallback to original format */}
          <motion.img
            src={finalSrc}
            srcSet={!hasError ? srcSet : undefined}
            sizes={supportsOptimization(finalSrc) ? sizes : undefined}
            alt={alt || 'Image'}
            className={`w-full h-full ${objectFit === 'cover' ? 'object-cover' : objectFit === 'contain' ? 'object-contain' : ''} ${priority || isLoaded ? 'opacity-100' : 'opacity-0'} ${!priority && 'transition-opacity duration-300'}`}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            onLoad={handleLoad}
            onError={handleError}
            {...props}
          />
        </picture>
      )}
    </div>
  )
})

export default OptimizedImage
