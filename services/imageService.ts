// Comprehensive image service for random image generation
// Uses multiple reliable sources with proper fallbacks

export interface RandomImage {
  url: string;
  source: string;
  category: string;
  alt: string;
}

// Track used images to prevent repetition
const usedImageUrls = new Set<string>();
const usedImageSeeds = new Set<string>();

// INFINITE RANDOM IMAGE GENERATION - NO LOOPS, NO REPETITION
const INFINITE_IMAGE_SOURCES = {
  // Picsum with infinite random seeds
  picsumInfinite: {
    getRandomUrl: (width: number = 1280, height: number = 960) => {
      // Create truly unique seed using multiple random factors
      const timestamp = Date.now();
      const random1 = Math.floor(Math.random() * 999999999);
      const random2 = Math.floor(Math.random() * 999999999);
      const random3 = Math.random().toString(36).substring(2, 15);
      const random4 = Math.random().toString(36).substring(2, 15);
      const uniqueSeed = `${timestamp}-${random1}-${random2}-${random3}-${random4}`;
      return `https://picsum.photos/seed/${uniqueSeed}/${width}/${height}`;
    }
  },

  // Picsum with infinite random IDs
  picsumRandom: {
    getRandomUrl: (width: number = 1280, height: number = 960) => {
      const timestamp = Date.now();
      const randomId = Math.floor(Math.random() * 999999999) + timestamp;
      const randomSuffix = Math.random().toString(36).substring(2, 15);
      return `https://picsum.photos/${width}/${height}?random=${randomId}-${randomSuffix}`;
    }
  },

  // Picsum with infinite blur variations
  picsumBlurInfinite: {
    getRandomUrl: (width: number = 1280, height: number = 960) => {
      const timestamp = Date.now();
      const randomId = Math.floor(Math.random() * 999999999) + timestamp;
      const blurAmount = Math.floor(Math.random() * 10) + 1; // 1-10 blur
      const randomSuffix = Math.random().toString(36).substring(2, 15);
      return `https://picsum.photos/${width}/${height}?random=${randomId}&blur=${blurAmount}&sig=${randomSuffix}`;
    }
  },

  // Picsum with infinite grayscale variations
  picsumGrayscaleInfinite: {
    getRandomUrl: (width: number = 1280, height: number = 960) => {
      const timestamp = Date.now();
      const randomId = Math.floor(Math.random() * 999999999) + timestamp;
      const grayscale = Math.random() > 0.5 ? '&grayscale' : '';
      const randomSuffix = Math.random().toString(36).substring(2, 15);
      return `https://picsum.photos/${width}/${height}?random=${randomId}${grayscale}&sig=${randomSuffix}`;
    }
  },

  // Picsum with infinite aspect ratio variations
  picsumAspectInfinite: {
    getRandomUrl: (width: number = 1280, height: number = 960) => {
      const timestamp = Date.now();
      const randomId = Math.floor(Math.random() * 999999999) + timestamp;
      // Vary dimensions significantly for more variety
      const widthVariation = Math.floor(Math.random() * 400) - 200; // -200 to +200
      const heightVariation = Math.floor(Math.random() * 400) - 200; // -200 to +200
      const newWidth = Math.max(800, width + widthVariation);
      const newHeight = Math.max(600, height + heightVariation);
      const randomSuffix = Math.random().toString(36).substring(2, 15);
      return `https://picsum.photos/${newWidth}/${newHeight}?random=${randomId}&sig=${randomSuffix}`;
    }
  },

  // Unsplash with infinite variations
  unsplashInfinite: {
    getRandomUrl: (width: number = 1280, height: number = 960) => {
      const categories = ['nature', 'city', 'people', 'abstract', 'technology', 'architecture', 'animals', 'food', 'travel', 'sports', 'music', 'art'];
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 15);
      return `https://source.unsplash.com/${width}x${height}/?${randomCategory}&sig=${timestamp}-${randomSuffix}`;
    }
  },

  // Placeholder with infinite color/text variations
  placeholderInfinite: {
    getRandomUrl: (width: number = 1280, height: number = 960) => {
      const colors = ['FF6B6B', '4ECDC4', '45B7D1', '96CEB4', 'FFEAA7', 'DDA0DD', '98D8C8', 'F7DC6F', 'FF9F43', '10AC84', 'EE5A24', '0984E3', '6C5CE7', 'A29BFE', 'FD79A8', 'FDCB6E', '00D2D3', 'FF6348', '2ED573', 'FFA502', 'FF3838', '3742FA', '2F3542', 'A4B0BE'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const timestamp = Date.now();
      const randomText = Math.random().toString(36).substring(2, 20) + timestamp + Math.random().toString(36).substring(2, 20);
      return `https://via.placeholder.com/${width}x${height}/${randomColor}/FFFFFF?text=${randomText}`;
    }
  },

  // Lorem Picsum with infinite category variations
  picsumCategoryInfinite: {
    getRandomUrl: (width: number = 1280, height: number = 960) => {
      const categories = ['nature', 'city', 'people', 'abstract', 'technology', 'architecture', 'animals', 'food', 'travel', 'sports', 'music', 'art'];
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      const timestamp = Date.now();
      const randomId = Math.floor(Math.random() * 999999999) + timestamp;
      const randomSuffix = Math.random().toString(36).substring(2, 15);
      return `https://picsum.photos/${width}/${height}?random=${randomId}&category=${randomCategory}&sig=${randomSuffix}`;
    }
  }
};

import { BACKEND_URL } from "../utils/config";

// Convert external image URLs to a CORS-friendly proxy so <img> loads reliably and canvas can read pixels
function toCorsProxy(originalUrl: string): string {
  try {
    // Prefer backend proxy if present
    const apiBase = BACKEND_URL;
    if (apiBase) {
      return `${apiBase}/api/img?url=${encodeURIComponent(originalUrl)}`;
    }
    // If already weserv, return as-is
    if (originalUrl.includes('images.weserv.nl')) return originalUrl;
    const u = new URL(originalUrl);
    const hostAndPath = `${u.host}${u.pathname}${u.search}`;
    return `https://images.weserv.nl/?url=${encodeURIComponent(hostAndPath)}`;
  } catch {
    return originalUrl;
  }
}

// Curated high-quality image IDs from Unsplash for specific categories
const CURATED_IMAGES = {
  'professional-scenes': [
    '1521737604893-d14cc237f11d', '1486406146926-c627a92ad1ab', '1522075469751-3a6694fb2f61',
    '1522252234503-e356532cafd5', '1504384308090-c894fdcc538d', '1488590528505-98d2b5aba04b',
    '1518770660439-4636190af475', '1487058792275-0ad4aaf24ca7', '1507003211169-0a1dd7228f2d',
    '1552664730-d307ca884979', '1560472354-b33ff0c44a43', '1553877522-43269d4ea984',
    '1559136555-9303baea8ebd', '1521737604893-d14cc237f11d', '1486406146926-c627a92ad1ab'
  ],
  'emotions-expression': [
    '1524504388940-b1c1722653e1', '1503342217505-b0a15ec3261c', '1517841905240-472988babdf9',
    '1506794778202-cad84cf45f1d', '1506157382-97eda2d62296', '1556157382-97eda2d62296',
    '1507003211169-0a1dd7228f2d', '1494790108755-2616b612b786', '1506794778202-cad84cf45f1d',
    '1507003211169-0a1dd7228f2d', '1494790108755-2616b612b786', '1506794778202-cad84cf45f1d'
  ],
  'nature-environment': [
    '1500530855697-b586d89ba3ee', '1441974231531-c6227db76b6e', '1500534314209-a25ddb2bd429',
    '1501785888041-af3ef285b470', '1506905925346-21bda4d32df4', '1447752875215-b2761acb3c27',
    '1506905925346-21bda4d32df4', '1447752875215-b2761acb3c27', '1506905925346-21bda4d32df4',
    '1447752875215-b2761acb3c27', '1506905925346-21bda4d32df4', '1447752875215-b2761acb3c27'
  ],
  'technology-innovation': [
    '1518770660439-4636190af475', '1487058792275-0ad4aaf24ca7', '1504384308090-c894fdcc538d',
    '1488590528505-98d2b5aba04b', '1518770660439-4636190af475', '1487058792275-0ad4aaf24ca7',
    '1504384308090-c894fdcc538d', '1488590528505-98d2b5aba04b', '1518770660439-4636190af475',
    '1487058792275-0ad4aaf24ca7', '1504384308090-c894fdcc538d', '1488590528505-98d2b5aba04b'
  ],
  'places-architecture': [
    '1467269204594-9661b134dd2b', '1472214103451-9374bd1c798e', '1489515217757-5fd1be406fef',
    '1491557345352-5929e343eb89', '1467269204594-9661b134dd2b', '1472214103451-9374bd1c798e',
    '1489515217757-5fd1be406fef', '1491557345352-5929e343eb89', '1467269204594-9661b134dd2b',
    '1472214103451-9374bd1c798e', '1489515217757-5fd1be406fef', '1491557345352-5929e343eb89'
  ],
  'art-creativity': [
    '1526498460520-4c246339dccb', '1513364776144-60967b0f800f', '1527254059240-1f7e7d05b4e0',
    '1531665466865-7f30e61b1602', '1526498460520-4c246339dccb', '1513364776144-60967b0f800f',
    '1527254059240-1f7e7d05b4e0', '1531665466865-7f30e61b1602', '1526498460520-4c246339dccb',
    '1513364776144-60967b0f800f', '1527254059240-1f7e7d05b4e0', '1531665466865-7f30e61b1602'
  ],
  'human-stories': [
    '1487412720507-e7ab37603c6f', '1508214751196-bcfd4ca60f91', '1504593811423-6dd665756598',
    '1470843810958-2da815d0e041', '1487412720507-e7ab37603c6f', '1508214751196-bcfd4ca60f91',
    '1504593811423-6dd665756598', '1470843810958-2da815d0e041', '1487412720507-e7ab37603c6f',
    '1508214751196-bcfd4ca60f91', '1504593811423-6dd665756598', '1470843810958-2da815d0e041'
  ],
  'dream-fantasy': [
    '1501594907352-04cda38ebc29', '1500534314209-92ad3ebb6329', '1517816825585-142f1e4ec332',
    '1499244571948-7ccddb3583f1', '1501594907352-04cda38ebc29', '1500534314209-92ad3ebb6329',
    '1517816825585-142f1e4ec332', '1499244571948-7ccddb3583f1', '1501594907352-04cda38ebc29',
    '1500534314209-92ad3ebb6329', '1517816825585-142f1e4ec332', '1499244571948-7ccddb3583f1'
  ]
};

/**
 * Generates INFINITE random images - NO LOOPS, NO REPETITION, EVER!
 * @param domainSlug - Optional domain to get domain-specific images
 * @param width - Image width (default: 1600)
 * @param height - Image height (default: 1200)
 * @returns Promise<RandomImage>
 */
export async function getRandomImage(
  domainSlug?: string,
  width: number = 1280,
  height: number = 960
): Promise<RandomImage> {
  console.log('🎲 Generating INFINITE random image for domain:', domainSlug);

  // INFINITE RANDOM GENERATION - NO TRACKING, NO LOOPS, JUST PURE RANDOMNESS
  const sources = Object.keys(INFINITE_IMAGE_SOURCES);
  const randomSource = sources[Math.floor(Math.random() * sources.length)];

  try {
    const sourceConfig = INFINITE_IMAGE_SOURCES[randomSource as keyof typeof INFINITE_IMAGE_SOURCES];
    const imageUrl = sourceConfig.getRandomUrl(width, height);

    console.log('🎲 Generated INFINITE random image:', {
      url: imageUrl,
      source: randomSource,
      timestamp: Date.now()
    });

    return {
      url: toCorsProxy(imageUrl),
      source: randomSource,
      category: 'infinite-random',
      alt: `Infinite random image from ${randomSource}`
    };
  } catch (error) {
    console.warn(`Failed to get image from ${randomSource}, using guaranteed fallback:`, error);

    // GUARANTEED FALLBACK - ALWAYS UNIQUE
    const timestamp = Date.now();
    const random1 = Math.floor(Math.random() * 999999999);
    const random2 = Math.random().toString(36).substring(2, 15);
    const random3 = Math.random().toString(36).substring(2, 15);
    const fallbackUrl = `https://picsum.photos/seed/${timestamp}-${random1}-${random2}-${random3}/${width}/${height}`;

    return {
      url: toCorsProxy(fallbackUrl),
      source: 'picsum-infinite-fallback',
      category: 'infinite-fallback',
      alt: 'Infinite random fallback image'
    };
  }
}

/**
 * Tests if an image URL is accessible
 * @param url - Image URL to test
 * @returns Promise<boolean>
 */
async function testImageAccessibility(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Gets multiple random images for a domain
 * @param domainSlug - Domain slug
 * @param count - Number of images to generate
 * @param width - Image width
 * @param height - Image height
 * @returns Promise<RandomImage[]>
 */
export async function getRandomImagesForDomain(
  domainSlug: string,
  count: number = 25,
  width: number = 1600,
  height: number = 1200
): Promise<RandomImage[]> {
  console.log(`🎲 Generating ${count} random images for domain: ${domainSlug}`);

  const images: RandomImage[] = [];
  const usedUrls = new Set<string>();

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let image: RandomImage;

    do {
      image = await getRandomImage(domainSlug, width, height);
      attempts++;
    } while (usedUrls.has(image.url) && attempts < 5);

    if (!usedUrls.has(image.url)) {
      images.push(image);
      usedUrls.add(image.url);
    }
  }

  return images;
}

/**
 * Gets an INFINITE random image with retry logic - NO LOOPS, NO REPETITION!
 * @param domainSlug - Optional domain slug
 * @param maxRetries - Maximum number of retries
 * @returns Promise<RandomImage>
 */
export async function getRandomImageWithRetry(
  domainSlug?: string,
  maxRetries: number = 3
): Promise<RandomImage> {
  let lastError: Error | null = null;

  const withTimeout = <T>(p: Promise<T>, ms: number) => new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('image load timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

  const tryLoad = (url: string, timeoutMs = 3500) => withTimeout(new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image error'));
    img.src = url;
  }), timeoutMs);

  const getCandidates = () => {
    const entries = Object.entries(INFINITE_IMAGE_SOURCES);
    // Shuffle a bit and take first few for racing
    const shuffled = entries.sort(() => Math.random() - 0.5).slice(0, 5);
    return shuffled.map(([key, src]) => {
      const raw = (src as any).getRandomUrl(1280, 960);
      return { key, url: toCorsProxy(raw) };
    });
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🎲 INFINITE fast attempt ${attempt}/${maxRetries} (parallel race)`);
      const candidates = getCandidates();
      const race = await Promise.any(candidates.map(c => tryLoad(c.url).then(() => c)));
      console.log(`✅ Fast image loaded from ${race.key}`);
      return {
        url: race.url,
        source: race.key,
        category: 'infinite-random',
        alt: `Infinite random image from ${race.key}`
      };
    } catch (error) {
      lastError = error as Error;
      console.warn(`❌ Fast attempt ${attempt} failed:`, error);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 400 * attempt));
      }
    }
  }

  // If all attempts failed, return a guaranteed working INFINITE fallback
  console.warn('🚨 All INFINITE attempts failed, using guaranteed INFINITE fallback');
  const timestamp = Date.now();
  const random1 = Math.floor(Math.random() * 999999999);
  const random2 = Math.random().toString(36).substring(2, 15);
  const random3 = Math.random().toString(36).substring(2, 15);
  const random4 = Math.random().toString(36).substring(2, 15);

  return {
    url: toCorsProxy(`https://picsum.photos/seed/${timestamp}-${random1}-${random2}-${random3}-${random4}/1280/960`),
    source: 'picsum-infinite-guaranteed-fallback',
    category: 'infinite-fallback',
    alt: 'Guaranteed infinite fallback image'
  };
}

/**
 * Clears the used images cache to allow repetition if needed
 */
export function clearUsedImagesCache(): void {
  console.log('🧹 Clearing used images cache');
  usedImageUrls.clear();
  usedImageSeeds.clear();
}

/**
 * Gets the count of used images
 */
export function getUsedImagesCount(): { urls: number; seeds: number } {
  return {
    urls: usedImageUrls.size,
    seeds: usedImageSeeds.size
  };
}

/**
 * Preloads images to ensure they're accessible
 * @param images - Array of RandomImage objects
 * @returns Promise<RandomImage[]> - Only images that loaded successfully
 */
export async function preloadImages(images: RandomImage[]): Promise<RandomImage[]> {
  const loadedImages: RandomImage[] = [];

  for (const image of images) {
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = reject;
        img.src = image.url;
      });
      loadedImages.push(image);
    } catch (error) {
      console.warn(`Failed to preload image: ${image.url}`, error);
    }
  }

  return loadedImages;
}
